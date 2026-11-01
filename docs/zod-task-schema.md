# Zod-схема для Task как общий пакет воркспейса

Цель: вынести описание задачи (`Task`) в отдельный пакет `@rest/contract` на zod, подключить его в `express/local` и заменить ручную валидацию в `POST` и `PATCH`. Потом тот же пакет понадобится в `express/mongo`, `node/*` и `nest/*`.

Всё, что описано ниже, я прогнал на копии репозитория: `tsx`, `tsc --noEmit`, `tsc` (build), `node dist/index.js` и `nest build` + `node dist/main.js`. Версии, на которых всё работает:

| Что        | Версия                             |
| ---------- | ---------------------------------- |
| Node       | 22.19.0                            |
| pnpm       | 10.27.0                            |
| zod        | **4.6.7**                          |
| TypeScript | 7.0.2 (node/express), 6.0.3 (nest) |
| tsx        | 4.23.15                            |
| turbo      | 2.11.10                            |

---

## Шаг 0. Имя и место пакета

**Решение:** папка `packages/contract`, имя пакета `@rest/contract`.

- `packages/*`: обычное в монорепо место для библиотек, которые сами не запускаются. Они не смешиваются с `node/`, `express/` и `nest/`, где лежат приложения.
- `contract`: в пакете будет «договор» API (какие данные принимает и отдаёт `/tasks`), общий для всех 9 реализаций. Название `shared` со временем превращается в свалку, а `contract` сразу говорит, что здесь лежит.
- Скоуп `@rest/` нужен, чтобы в импортах было видно, что пакет свой, а не из npm: `import ... from "@rest/contract"`. Пакет мы не публикуем, а `workspace:*` гарантирует, что pnpm возьмёт его только из воркспейса.

---

## Шаг 1. Создать пакет и подключить его

- [ ] **1.1. Добавить `packages/*` в воркспейс.** В `pnpm-workspace.yaml`:

  ```yaml
  packages:
    - packages/*
    - node/*
    - express/*
    - nest/*
  ```

  _Зачем:_ pnpm видит только пакеты из папок, перечисленных в этом списке.

- [ ] **1.2. Добавить zod в каталог ВРУЧНУЮ.** В тот же файл, в секцию `catalog:`:

  ```yaml
  catalog:
    # tooling
    ...
    # validation
    zod: ^4.6.7
  ```

  > ⚠️ Команды `pnpm add zod --save-catalog` и `pnpm add zod@catalog:` на pnpm 10.27 **переписывают `pnpm-workspace.yaml` целиком**: удаляют все комментарии (в том числе пояснение про TS 6 для Nest), сортируют ключи и меняют кавычки. Я это проверил. Поэтому каталог правим руками, а потом запускаем `pnpm install`: он файл не трогает. Команда `pnpm add <pkg> --workspace` тоже его не трогает.

- [ ] **1.3. `packages/contract/package.json`:**

  ```json
  {
    "name": "@rest/contract",
    "version": "1.0.0",
    "private": true,
    "type": "module",
    "exports": {
      ".": "./src/index.ts"
    },
    "scripts": {
      "typecheck": "tsc --noEmit"
    },
    "dependencies": {
      "zod": "catalog:"
    },
    "devDependencies": {
      "typescript": "catalog:"
    }
  }
  ```

  _Зачем `exports` смотрит прямо на `.ts`:_ пакет потребляется из исходников, без сборки. Почему так можно, объясняет шаг 2. Поле `types` не нужно: TypeScript читает типы прямо из `.ts`.

- [ ] **1.4. `packages/contract/tsconfig.json`:**

  ```json
  {
    "extends": "../../tsconfig.base.json",
    "compilerOptions": {
      "types": [],
      "erasableSyntaxOnly": true
    },
    "include": ["src"]
  }
  ```

  - `"types": []`: в базовом конфиге стоит `types: ["node"]`, а контракту Node не нужен. Без этой строки будет ошибка `Cannot find type definition file for 'node'`. Второй вариант: добавить в пакет `@types/node`.
  - `"erasableSyntaxOnly": true`: страховка для шага 2. Запрещает `enum`, `namespace` и parameter properties, то есть всё, что Node не умеет просто «стереть».
  - `rootDir` и `outDir` не нужны: этот пакет ничего не собирает.

- [ ] **1.5. Заглушка `packages/contract/src/index.ts`**, чтобы сразу проверить подключение:

  ```ts
  export const hello = "contract";
  ```

- [ ] **1.6. Подключить пакет в express/local:**

  ```bash
  pnpm install                                                      # подхватит новый пакет и zod
  pnpm add @rest/contract --workspace --filter rest-node-express-local
  ```

  `--workspace` означает «бери только из воркспейса». Если пакета там нет, команда упадёт, а не пойдёт в npm. В `express/local/package.json` появится `"@rest/contract": "workspace:*"`.

- [ ] **1.7. (Необязательно) zod в `express/local`.** В роутах из шага 4 zod напрямую не импортируется, только схемы из `@rest/contract`, поэтому сейчас этот шаг можно пропустить. Он понадобится, если в `express/local` появится `import * as z from "zod"` (например, ради `z.prettifyError`): pnpm не даёт импортировать то, что не указано в своём `package.json`, будет `TS2307: Cannot find module 'zod'`. Тогда руками допишите в `dependencies` строку `"zod": "catalog:"` и запустите `pnpm install`. Каталог гарантирует одну версию zod на весь воркспейс.

**Как проверить:**

```bash
ls -l express/local/node_modules/@rest        # contract -> ../../../../packages/contract (симлинк)
pnpm --filter rest-node-express-local exec node --input-type=module -e 'import("@rest/contract").then(m => console.log(m))'
# { hello: 'contract' }
git diff pnpm-workspace.yaml                  # комментарии на месте
```

---

## Шаг 2. Главное решение: исходники или `dist`

**Опасение.** `exports` указывает на `./src/index.ts`. `tsx` и `tsc --noEmit` с этим справятся, а вот `pnpm build && pnpm start` запускает обычный `node dist/index.js`. Node не умеет убирать типы из файлов внутри `node_modules`, а пакет подключён именно туда.

**Что оказалось на самом деле (проверено):**

1. pnpm подключает пакет из воркспейса **симлинком**. Node по умолчанию раскрывает симлинк до реального пути `packages/contract/src/index.ts`, а в этом пути нет `node_modules`.
2. В Node ≥ 22.18 удаление типов (type stripping) включено по умолчанию (`process.features.typescript === "strip"`), и предупреждений в консоли нет.
3. Поэтому `node dist/index.js` спокойно грузит `@rest/contract` прямо из `.ts`. `tsc` при сборке express/local сам пакет не компилирует: `import ... from "@rest/contract"` остаётся в `dist` как есть.
4. Опасение подтверждается только в особых случаях. `node --preserve-symlinks dist/...` падает с `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`. То же будет, если пакет **скопирован** в `node_modules`: `injectWorkspacePackages`, `pnpm deploy`, сборка Docker-образа.

Варианты:

|                              | Как устроено                                                                                                                                      | Плюсы                                                                                       | Минусы                                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **(a) Сборка в dist**        | `build: tsc` в контракте, `exports` → `{ types: ./dist/index.d.ts, default: ./dist/index.js }`                                                    | Работает везде, включая Docker и `pnpm deploy`                                              | Перед `dev` и `typecheck` контракт надо собрать (в turbo `typecheck` зависит только от `^typecheck`, `dev` не зависит ни от чего), в dev нужен `tsc --watch` контракта, легко получить устаревший dist |
| **(b) Кастомные conditions** | `exports: { "@rest/source": "./src/index.ts", "default": "./dist/index.js" }` + `customConditions` в tsconfig + `--conditions=@rest/source` у tsx | В dev исходники, в рантайме dist                                                            | Три места настройки, а сборка всё равно нужна. Для учебного проекта лишняя сложность (этот вариант я не проверял)                                                                                      |
| **(c) Только исходники** ✅  | `exports: "./src/index.ts"`, как в шаге 1                                                                                                         | Ноль сборки и ноль настроек turbo; правка в контракте сразу видна в `tsx watch` (проверено) | Работает только при соблюдении правил ниже                                                                                                                                                             |

**Рекомендация: (c).** Это «just-in-time package», как такие пакеты называют в Turborepo. В учебном проекте это самый короткий путь, и он работает во всех сценариях, которые я проверил:

- `pnpm --filter rest-node-express-local dev` (tsx): ✅, и `tsx watch` перезапускается при правке контракта;
- `pnpm --filter rest-node-express-local typecheck`: ✅;
- `pnpm --filter rest-node-express-local build`, затем `start` (`node dist/index.js`): ✅, все запросы из шага 5 дают ожидаемые ответы;
- `nest/local`: `tsc --noEmit` на TS 6 ✅, `nest build` через SWC ✅, `node dist/main.js` ✅ (SWC компилирует только приложение, контракт подгружается из `.ts`);
- turbo: при правке `packages/contract/src/*` кэш `build` у express/local сбрасывается (cache miss), поэтому устаревших сборок не бывает.

**Правила, без которых (c) ломается:**

- [ ] Внутри контракта относительные импорты пишем **с `.ts`**: `export * from "./task.schema.ts"`. Если написать `.js`, то `tsc` и `tsx` молча примут импорт, а `node dist/index.js` упадёт с `ERR_MODULE_NOT_FOUND ... task.schema.js` (проверено).
- [ ] Только «стираемый» синтаксис: никаких `enum` и `namespace`. За этим следит `erasableSyntaxOnly`.
- [ ] Node ≥ 22.18. Можно поднять `"engines": { "node": ">=22.18" }` в корневом `package.json`.
- [ ] Когда дойдёте до Docker или `pnpm deploy`, переходите на вариант (a). Это локальная правка в `packages/contract`, код приложений менять не придётся.

---

## Шаг 3. Пишем схему

### Как вообще устроена схема в zod

Схема — это **описание** того, какими должны быть данные. Собирается цепочкой методов:

```ts
z.string() // значение должно быть строкой
  .trim() // ...обрежь пробелы по краям
  .min(1); // ...и после этого длина хотя бы 1
```

Три правила, которые надо запомнить:

1. **Каждый метод возвращает НОВУЮ схему**, старая не меняется. Поэтому из одной базовой схемы можно сделать несколько вариантов (для POST, для PATCH), и базовая останется прежней.
2. **По умолчанию любое поле обязательное.** Это наоборот, чем в yup. Необязательным поле делает `.optional()`, а `.partial()` делает необязательными сразу все поля объекта.
3. **zod проверяет как есть, без приведения типов.** `"true"` — это строка, а не boolean, `123` — число, а не строка. Неверный тип — ошибка. Для API это ровно то, что нужно.

Текст ошибки в zod 4 задаётся через `{ error: "..." }` (в zod 3 было `{ message: "..." }`, в старых статьях встретите именно его).

### Готовый файл

`packages/contract/src/task.schema.ts`:

```ts
import * as z from "zod";

// ─── 1. Базовая схема: как задача выглядит целиком ─────────────────────

export const TaskSchema = z.object(
  {
    id: z.string(),
    title: z
      .string({
        error: (issue) =>
          issue.input === undefined
            ? "title is required"
            : "title must be a string",
      })
      .trim()
      .min(1, { error: "title must be a non-empty string" }),
    isCompleted: z.boolean({ error: "isCompleted must be a boolean" }),
  },
  { error: "body must be a JSON object" },
);

// ─── 2. Схема для POST ──────────────────────────────────────────────────

export const CreateTaskSchema = TaskSchema.omit({ id: true }).extend({
  isCompleted: TaskSchema.shape.isCompleted.default(false),
});

// ─── 3. Схема для PATCH ─────────────────────────────────────────────────

export const UpdateTaskSchema = TaskSchema.omit({ id: true })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    error: "at least one field is required",
  });

// ─── 4. Типы из схем ────────────────────────────────────────────────────

export type Task = z.infer<typeof TaskSchema>;
export type CreateTaskDto = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskDto = z.infer<typeof UpdateTaskSchema>;
```

И в `packages/contract/src/index.ts`:

```ts
export * from "./task.schema.ts";
```

(с `.ts` в конце, почему — в шаге 2).

### Разбор по строкам

**Импорт**

```ts
import * as z from "zod";
```

Всё API zod лежит в объекте `z`: `z.object`, `z.string`, `z.infer`... Так рекомендует документация zod 4.

**1. Базовая схема `TaskSchema`**

```ts
export const TaskSchema = z.object(
  { ...поля... },
  { error: "body must be a JSON object" },
);
```

`z.object()` принимает два аргумента:

- первый — поля: ключ → схема поля;
- второй — настройки. `error` здесь — текст ошибки, если пришёл **вообще не объект**: тела нет (`undefined`), `null`, строка. Без него будет стандартное `Invalid input: expected object, received undefined`.

Эта схема описывает задачу **целиком**, как она лежит в базе. Из неё мы потом выведем схемы для POST и PATCH.

```ts
    id: z.string(),
```

`id` — строка. Это поле нужно только для типа `Task`, в POST и PATCH мы его уберём.

```ts
title: z.string({
  error: (issue) =>
    issue.input === undefined ? "title is required" : "title must be a string",
});
```

`title` должен быть строкой. В `error` здесь не строка, а **функция**: zod вызывает её, когда проверка типа не прошла, и передаёт `issue` — описание проблемы. `issue.input` — то, что пришло на самом деле:

- `undefined` — поля нет вообще → `"title is required"`;
- что-то другое (число, `true`) → `"title must be a string"`.

Так одна схема даёт два разных понятных сообщения. Если хватит одного, можно проще: `z.string({ error: "title must be a string" })`.

```ts
      .trim()
```

Обрезает пробелы по краям. В отличие от yup, **на самом деле меняет** значение: из `"  Learn zod  "` в результат попадёт `"Learn zod"`.

```ts
      .min(1, { error: "title must be a non-empty string" }),
```

Длина хотя бы 1 символ. Проверка идёт **после** `.trim()`, поэтому `"   "` превращается в `""` и не проходит. Вместе `.trim().min(1)` = «непустая строка, и не из одних пробелов».

```ts
    isCompleted: z.boolean({ error: "isCompleted must be a boolean" }),
```

Только `true` или `false`. Строка `"true"` или число `1` — ошибка.

**2. Схема для POST**

```ts
export const CreateTaskSchema = TaskSchema.omit({ id: true });
```

`.omit({ id: true })` — та же схема, но **без поля `id`**: клиент его не присылает, id генерирует сервер. `true` здесь просто значит «убрать это поле».

```ts
  .extend({
    isCompleted: TaskSchema.shape.isCompleted.default(false),
  });
```

`.extend({...})` — добавить или **заменить** поля. Мы заменяем `isCompleted`:

- `TaskSchema.shape.isCompleted` — достаём схему поля `isCompleted` из базовой (`.shape` — это объект со схемами всех полей). Так сообщение об ошибке пишется один раз;
- `.default(false)` — если поле не прислали, подставить `false`. Поле от этого становится необязательным.

Итого POST принимает: `title` обязательно, `isCompleted` по желанию (по умолчанию `false`).

**3. Схема для PATCH**

```ts
export const UpdateTaskSchema = TaskSchema.omit({ id: true });
```

Снова без `id`. Обратите внимание: берём **`TaskSchema`, а не `CreateTaskSchema`**. Почему — ниже, в «ловушке с default».

```ts
  .partial()
```

Все поля становятся необязательными: в PATCH присылают только то, что меняют. Проверки при этом остаются: если `title` прислали, он всё так же должен быть непустой строкой.

```ts
  .refine((data) => Object.keys(data).length > 0, {
    error: "at least one field is required",
  });
```

`.refine()` — **своя проверка**. Функция получает уже проверенные данные и возвращает `true` (всё хорошо) или `false` (ошибка с текстом из `error`). Здесь: хотя бы одно поле должно быть. Пустой `{}` ничего не меняет, поэтому 400.

**4. Типы**

```ts
export type Task = z.infer<typeof TaskSchema>;
// { id: string; title: string; isCompleted: boolean }

export type CreateTaskDto = z.infer<typeof CreateTaskSchema>;
// { title: string; isCompleted: boolean }

export type UpdateTaskDto = z.infer<typeof UpdateTaskSchema>;
// { title?: string | undefined; isCompleted?: boolean | undefined }
```

`z.infer` достаёт TypeScript-тип из схемы. Схема — единственный источник правды: поменяли схему, тип поменялся сам.

Обратите внимание на `CreateTaskDto`: `isCompleted` там **обязательный** `boolean`. Это потому что `z.infer` показывает данные **после** проверки, а `.default(false)` гарантирует, что поле будет.

### Ловушка с `.default()`

В zod 4 значение по умолчанию **срабатывает даже внутри `.partial()`**. Если бы мы сделали `UpdateTaskSchema = CreateTaskSchema.partial()`, то `PATCH {"title": "x"}` вернул бы `{ title: "x", isCompleted: false }` и **молча сбросил бы** задачу в «не выполнена». Поэтому `default` есть только в схеме для POST, а PATCH строится от базовой `TaskSchema`, где default нет.

### Лишние поля

`z.object` по умолчанию **вырезает** неизвестные поля. `POST {"title":"x","id":"hacked","foo":1}` → в результате только `{ title: "x", isCompleted: false }`, id сгенерирует сервер. Хотите вместо этого отвечать 400 — замените `z.object` на `z.strictObject` (ошибка `Unrecognized key: "foo"`). Для начала оставьте как есть.

### Подключаем типы в express/local

- [ ] **Замените ручные типы на типы из контракта.** Сделайте `express/local/src/types/task.type.ts` реэкспортом, тогда импорты в репозиториях менять не нужно:
  ```ts
  export type { CreateTaskDto, Task, UpdateTaskDto } from "@rest/contract";
  ```
  Почему это обязательно: старый `UpdateTaskDto = Partial<Omit<Task, "id">>` при `exactOptionalPropertyTypes` означает `title?: string` (без `undefined`), а zod выдаёт `title?: string | undefined`. Если оставить старые типы, будет ошибка `TS2375`/`TS2379 ... with 'exactOptionalPropertyTypes: true'` (проверено).
- [ ] `?? false` в `FileTaskRepository.create` теперь лишний (`isCompleted` всегда приходит), но не мешает. Удалять или нет — решайте сами.

**Как проверить:**

```bash
pnpm --filter @rest/contract typecheck
pnpm --filter rest-node-express-local exec node --input-type=module -e 'import { CreateTaskSchema, UpdateTaskSchema } from "@rest/contract"; console.log(CreateTaskSchema.safeParse({ title: "  a  " }).data, UpdateTaskSchema.safeParse({}).success, UpdateTaskSchema.safeParse({ title: "b" }).data)'
# { title: 'a', isCompleted: false } false { title: 'b' }
```

---

## Шаг 4. Используем схему в роутах

### Как zod сообщает об ошибке

У схемы два метода проверки:

| Метод                     | Если всё хорошо           | Если ошибка                                         |
| ------------------------- | ------------------------- | --------------------------------------------------- |
| `schema.safeParse(value)` | `{ success: true, data }` | `{ success: false, error }` — **ничего не бросает** |
| `schema.parse(value)`     | возвращает данные         | **бросает** `ZodError`                              |

Берём `safeParse`: не нужен `try/catch`, а TypeScript после проверки `if (!result.success)` сам знает, что дальше `result.data` есть и правильного типа.

Что внутри `result.error`:

- `result.error.issues` — массив проблем. У каждой есть `message` (наш текст) и `path` (где: `["title"]`);
- zod **сразу собирает все ошибки**, а не только первую (в yup для этого нужен `abortEarly: false`).

### Готовый код роутов

`express/local/src/routes/task-route.ts` — замените обработчики `post` и `patch`, остальное не трогайте:

```ts
import { Router } from "express";
import { CreateTaskSchema, UpdateTaskSchema } from "@rest/contract";
import type { TaskRepository } from "../repositories/task.repository.ts";

export const router = (tasks: TaskRepository) => {
  const router = Router();

  // ... get "/" и get "/:id" без изменений

  router.post("/", async (req, res) => {
    const result = CreateTaskSchema.safeParse(req.body);

    if (!result.success) {
      const message = result.error.issues
        .map((issue) => issue.message)
        .join("; ");
      res.status(400).json({ message });
      return;
    }

    const task = await tasks.create(result.data);
    res.status(201).json({ task });
  });

  router.patch("/:id", async (req, res) => {
    const { id } = req.params;
    const result = UpdateTaskSchema.safeParse(req.body);

    if (!result.success) {
      const message = result.error.issues
        .map((issue) => issue.message)
        .join("; ");
      res.status(400).json({ message });
      return;
    }

    const { title, isCompleted } = result.data;
    const task = await tasks.update(id, { title, isCompleted });

    if (!task) {
      res.status(404).json({ message: `Task ${id} not found` });
      return;
    }

    res.status(200).json({ task });
  });

  // ... delete "/:id" без изменений

  return router;
};
```

Этот код проверен tsc с вашими настройками и настоящими типами Express. Заметьте: `zod` в роутах **не импортируется**, только схемы из `@rest/contract`. Значит, `"zod": "catalog:"` в `express/local/package.json` (шаг 1.7) пока не нужен. Понадобится, если захотите `z.prettifyError` (ниже).

### Разбор

```ts
const result = CreateTaskSchema.safeParse(req.body);
```

Проверяем тело запроса. `req.body ?? {}` больше не нужен: если тела нет, схема сама ответит `body must be a JSON object`. Ручные `typeof title !== "string"` тоже не нужны — всё это теперь в схеме.

```ts
if (!result.success) {
  const message = result.error.issues.map((issue) => issue.message).join("; ");
  res.status(400).json({ message });
  return;
}
```

Если проверка не прошла: берём текст каждой проблемы и склеиваем через `"; "`. Например, `{"title":1,"isCompleted":"x"}` → `"title must be a string; isCompleted must be a boolean"`. Формат ответа остаётся вашим `{ message }`.

```ts
const task = await tasks.create(result.data);
```

Сюда доходим только при успехе, и `result.data` уже **очищенные** данные: `title` обрезан, `isCompleted` подставлен, лишние поля вырезаны. Поэтому берём `result.data`, а не `req.body`.

```ts
const { title, isCompleted } = result.data;
const task = await tasks.update(id, { title, isCompleted });
```

В PATCH — ваш стиль с деструктуризацией. Можно и короче: `tasks.update(id, result.data)`. Если поле не прислали, там будет `undefined`, а `??` в файловом репозитории оставит старое значение.

**Почему не `parse` + `errorHandler`.** `parse()` бросает `ZodError`, а у него **нет поля `status`**. Ваш `errorHandler` смотрит на `err.status ?? 500` и превратит ошибку клиента в 500. Поэтому `safeParse` прямо в роуте, а `errorHandler` остаётся простым.

### Другие форматы ошибки (по желанию)

Если захотите — нужен `import * as z from "zod"` и `"zod": "catalog:"` в `express/local/package.json`:

```ts
z.prettifyError(result.error);
// "✖ title must be a string\n  → at title\n✖ isCompleted must be a boolean\n  → at isCompleted"

z.flattenError(result.error).fieldErrors;
// { title: ["title must be a string"], isCompleted: ["isCompleted must be a boolean"] }
```

`prettifyError` удобен для логов, `flattenError` — если фронтенду нужны ошибки по полям. Для начала хватит `issues.map(...)`.

---

## Шаг 5. Проверки

- [ ] Типы и сборка (корневой `pnpm typecheck` пока падает на пустых пакетах с `TS18003 No inputs` — это не связано с zod, поэтому с фильтром; `...` значит «вместе с зависимостями»):
  ```bash
  pnpm turbo run typecheck build --filter=rest-node-express-local...
  ```
- [ ] Запуск из сборки: `pnpm --filter rest-node-express-local start`. Должен стартовать без `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` и `ERR_MODULE_NOT_FOUND`.
- [ ] Запросы в `api.http`:

```http
### Invalid title → 400
POST {{baseUrl}}/{{path}}
Content-Type: application/json

{ "title": "   " }

### isCompleted as string → 400
POST {{baseUrl}}/{{path}}
Content-Type: application/json

{ "title": "x", "isCompleted": "true" }

### Two errors at once → 400
POST {{baseUrl}}/{{path}}
Content-Type: application/json

{ "title": 1, "isCompleted": "x" }

### Extra fields are stripped → 201
POST {{baseUrl}}/{{path}}
Content-Type: application/json

{ "title": "x", "id": "hacked", "foo": 1 }

### Empty PATCH → 400
PATCH {{baseUrl}}/{{path}}/{{updatedId}}
Content-Type: application/json

{}
```

Что должно прийти (проверено на схеме выше):

| Запрос                                     | Ответ                                                                                    |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `POST {"title":"  Learn zod  "}`           | `201`, `title: "Learn zod"`, `isCompleted: false`                                        |
| `POST {"title":"   "}`                     | `400 title must be a non-empty string`                                                   |
| `POST {"title":1}`                         | `400 title must be a string`                                                             |
| `POST {}`                                  | `400 title is required`                                                                  |
| `POST {"title":"x","isCompleted":"true"}`  | `400 isCompleted must be a boolean`                                                      |
| `POST {"title":1,"isCompleted":"x"}`       | `400 title must be a string; isCompleted must be a boolean`                              |
| `POST {"title":"x","id":"hacked","foo":1}` | `201`, id сгенерирован, `foo` нет                                                        |
| `POST` без тела                            | `400 body must be a JSON object`                                                         |
| `POST` с телом `not json`                  | `400` от `express.json()` — у его ошибки есть `status`, её обработает ваш `errorHandler` |
| `PATCH {}`                                 | `400 at least one field is required`                                                     |
| `PATCH {"foo":1}`                          | `400 at least one field is required` (`foo` вырезан → пусто)                             |
| `PATCH {"isCompleted":true}`               | `200`, `title` не изменился                                                              |
| `PATCH {"title":42}`                       | `400 title must be a string`                                                             |
| `PATCH /missing {"title":"ok"}`            | `404 Task missing not found`                                                             |

---

## Шаг 6. Что дальше: переиспользование

`express/mongo` и `node/*` подключают пакет так же: `pnpm add @rest/contract --workspace --filter <app>`. В `node/*` нет Express, но `safeParse` по распарсенному JSON работает точно так же. Для Nest есть два пути: свой `ZodValidationPipe` на десяток строк (`safeParse` + `BadRequestException`) или готовый `nestjs-zod` (`createZodDto`). Отдельно продумайте `id`: в local и postgres это UUID, в Mongo — `ObjectId` (24 hex-символа). Схемы тела это не затрагивает; для проверки `:id` в URL каждому хранилищу понадобится своя маленькая схема, а `Task.id` в контракте пусть остаётся `z.string()`.

---

## Типичные ошибки

- **Забыли `pnpm install`** после правки `pnpm-workspace.yaml` или `package.json`: `Cannot find module '@rest/contract'` или `'zod'`.
- **`pnpm add --save-catalog` или `pnpm add zod@catalog:`** переписали `pnpm-workspace.yaml` и стёрли комментарии. Каталог правим руками.
- **`import * as z from "zod"` в express/local без `"zod": "catalog:"` в его `package.json`:** `TS2307: Cannot find module 'zod'`. pnpm не даёт пользоваться чужими зависимостями.
- **`.js` вместо `.ts` в импортах внутри контракта:** dev и typecheck зелёные, `pnpm start` падает с `ERR_MODULE_NOT_FOUND`.
- **`enum` в контракте:** Node не может его «стереть». `erasableSyntaxOnly` поймает это на typecheck.
- **PATCH выведен из `CreateTaskSchema`:** `.default(false)` срабатывает и в `.partial()`, PATCH сбрасывает `isCompleted` в `false`.
- **`req.body` вместо `result.data` после проверки:** `title` не обрезан, лишние поля попадают в базу.
- **`schema.parse()` + `throw`:** `ZodError` без `status`, клиент получает `500` вместо `400`.
- **Старые ручные типы + `exactOptionalPropertyTypes`:** `TS2375`/`TS2379`. Берите типы из `z.infer`.
- **zod 3 по старой памяти:** в zod 4 текст ошибки — `{ error }`, а не `{ message }`; вместо `error.flatten()` — `z.flattenError(error)`.
