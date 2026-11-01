# Yup-схема для Task (вариант к zod-гайду)

Это та же задача, что и в [zod-task-schema.md](zod-task-schema.md): вынести описание `Task` в пакет `@rest/contract` и заменить ручную валидацию в `POST`/`PATCH`. Только на **yup**. Здесь описано то, что отличается. Всё общее (пакет, воркспейс, исходники вместо `dist`) делается один в один по zod-гайду.

Проверено на yup **1.7.1** + TypeScript 7.0.2 с флагами из `tsconfig.base.json` (`strict`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`): схема, типы и поведение валидации из таблиц ниже. Полную сборку `express/local` с yup я не прогонял, но к yup там ничего не привязано: пакет подключается так же, как с zod.

---

## Шаги 0–2: как в zod-гайде, с одной заменой

- [ ] Шаги 0, 1, 2 из [zod-task-schema.md](zod-task-schema.md) делаете как есть, только **везде вместо `zod` пишете `yup`**:
  - в каталоге `pnpm-workspace.yaml` (руками!): `yup: ^1.7.1`;
  - в `packages/contract/package.json`: `"yup": "catalog:"`;
  - в `express/local/package.json`: `"yup": "catalog:"` (в роутах импортируем `ValidationError` из yup).

---

## Главное отличие от zod: yup по умолчанию приводит типы

zod проверяет значение как есть. yup по умолчанию сначала **кастит** (пытается привести), потом проверяет. Для API это неприятно:

| Тело запроса | yup по умолчанию | yup со `.strict()` |
|---|---|---|
| `{"title": 123}` | ✅ `title: "123"` | ❌ `title must be a \`string\` type` |
| `{"isCompleted": "true"}` | ✅ `isCompleted: true` | ❌ `isCompleted must be a \`boolean\` type` |
| `{"isCompleted": 1}` | ✅ `isCompleted: true` | ❌ |
| `{"title": "a", "extra": 1}` | ✅ `extra` остаётся в результате | ❌ с `.noUnknown()`: `this field has unspecified keys: extra` |

**Решение: строгий режим (`.strict()`) на объекте + `.noUnknown()`.** Тогда yup ведёт себя как ваша ручная валидация: неправильный тип — 400.

Но у строгого режима есть две ловушки (проверено):

1. **`.trim()` перестаёт обрезать.** В strict-режиме трансформации не работают, и `.trim()` становится *проверкой* «строка уже без пробелов по краям»: `"  a "` → `this must be a trimmed string`. Поэтому «непустую строку» делаем своим `.test()`.
2. **`.default(false)` не применяется.** Значение по умолчанию подставляется на этапе каста, а strict его пропускает. Ничего страшного: у вас `?? false` уже стоит в `FileTaskRepository.create`, пусть так и остаётся.

> Альтернатива: не strict, а `stripUnknown: true` в опциях. Тогда лишние поля вырезаются (как в zod), `.trim()` обрезает, `.default()` работает, **но** `123` превращается в `"123"`, а `"true"` в `true`. Для учебного API честнее строгий режим.

---

## Шаг 3. Пишем схему

### Как вообще устроена схема в yup

Схема — это **описание** того, какими должны быть данные. Собирается она цепочкой методов:

```ts
string()                 // значение должно быть строкой
  .required("...")       // ...и обязательно присутствовать
  .test("...", "...", fn) // ...и проходить мою проверку
```

Три правила, которые надо запомнить:

1. **Каждый метод возвращает НОВУЮ схему**, старая не меняется. Поэтому можно описать поле один раз (`const title = string()...`) и потом сделать из него разные варианты: `title.required()` в одном месте, просто `title` в другом. Исходный `title` при этом остаётся необязательным.
2. **По умолчанию любое поле необязательное.** `string()` пропускает `undefined`. Обязательным поле делает только `.required()`.
3. **Второй аргумент почти любого метода — текст ошибки.** Именно он придёт в `err.errors`, если проверка не прошла.

### Готовый файл

`packages/contract/src/task.schema.ts`:

```ts
import { boolean, object, string, type InferType } from "yup";

// ─── 1. Поля ─────────────────────────────────────────────────────────────

const title = string()
  .typeError("title must be a string")
  .test(
    "not-blank",
    "title must be a non-empty string",
    (value) => value === undefined || value.trim().length > 0,
  );

const isCompleted = boolean().typeError("isCompleted must be a boolean");

// ─── 2. Схема для POST ──────────────────────────────────────────────────

export const createTaskSchema = object({
  title: title.required("title is required"),
  isCompleted,
})
  .strict()
  .noUnknown()
  .required("body is required");

// ─── 3. Схема для PATCH ─────────────────────────────────────────────────

export const updateTaskSchema = object({ title, isCompleted })
  .strict()
  .noUnknown()
  .required("body is required")
  .test(
    "not-empty",
    "at least one field is required",
    (value) => Object.keys(value).length > 0,
  );

// ─── 4. Типы из схем ────────────────────────────────────────────────────

export type CreateTaskDto = InferType<typeof createTaskSchema>;
export type UpdateTaskDto = InferType<typeof updateTaskSchema>;
export type Task = CreateTaskDto & { id: string; isCompleted: boolean };
```

И в `packages/contract/src/index.ts`:

```ts
export * from "./task.schema.ts";
```

(с `.ts` в конце, почему — в zod-гайде, шаг 2).

### Разбор по строкам

**1. Поле `title`**

```ts
const title = string()
```
Значение должно быть строкой. Если пришло число или `true`, проверка не пройдёт.

```ts
  .typeError("title must be a string")
```
Текст ошибки, когда пришла **не строка**. Без этой строки yup напишет своё длинное сообщение: ``title must be a `string` type, but the final value was: `1`.``

```ts
  .test(
    "not-blank",                              // имя проверки (любое, для отладки)
    "title must be a non-empty string",       // текст ошибки
    (value) => value === undefined || value.trim().length > 0,
  );
```
`.test()` — **своя проверка**. Функция получает значение поля и должна вернуть `true` (всё хорошо) или `false` (ошибка, вернётся текст из второго аргумента).

Почему `value === undefined ||` в начале: `.test()` вызывается всегда, даже если поля нет. А «есть поле или нет» — это работа `.required()`, не нашей проверки. Если здесь не пропустить `undefined`, то в PATCH `{"isCompleted": true}` (без `title`) упадёт с ошибкой про `title`.

Почему не `.trim().min(1)`, как в zod: мы включим строгий режим (`.strict()`, ниже), а в нём `.trim()` **не обрезает** строку, а проверяет, что пробелов по краям нет. `"  a "` получил бы ошибку `must be a trimmed string`. Своя проверка через `.test()` этой проблемы не имеет.

**Поле `isCompleted`**

```ts
const isCompleted = boolean().typeError("isCompleted must be a boolean");
```
Только `true` или `false`. Необязательное (нет `.required()`).

**2. Схема для POST**

```ts
export const createTaskSchema = object({
  title: title.required("title is required"),
  isCompleted,
})
```
`object({...})` описывает объект: ключ → схема поля. `title.required(...)` создаёт **новую** схему на основе `title`, но обязательную (правило 1). `isCompleted` — сокращение от `isCompleted: isCompleted`.

```ts
  .strict()
```
**Строгий режим: никакого приведения типов.** Без него yup «помогает»: `"123"` становится строкой `"123"` из числа `123`, `"true"` и `1` становятся `true`, и всё это проходит. Для API нам это не нужно: клиент прислал не тот тип — 400.

```ts
  .noUnknown()
```
**Запрет лишних полей.** `{"title":"x","foo":1}` → `this field has unspecified keys: foo`. Без этой строки yup просто пропустит `foo` дальше в результат.

```ts
  .required("body is required");
```
**Сам объект обязателен.** Да, у объекта тоже бывает `.required()`. Без него `validateSync(undefined)` (запрос без тела) **проходит** и возвращает `undefined` — я проверил.

**3. Схема для PATCH**

```ts
export const updateTaskSchema = object({ title, isCompleted })
```
Те же поля, но **без** `.required()` на `title`: в PATCH можно прислать только то, что меняешь. Здесь используется исходный `title`, который необязательный.

```ts
  .strict()
  .noUnknown()
  .required("body is required")
```
То же, что в POST.

```ts
  .test(
    "not-empty",
    "at least one field is required",
    (value) => Object.keys(value).length > 0,
  );
```
`.test()` на **объекте**: функция получает весь объект. Пустой `{}` → 400, потому что такой PATCH ничего не меняет.

**4. Типы из схем**

```ts
export type CreateTaskDto = InferType<typeof createTaskSchema>;
// { title: string; isCompleted?: boolean | undefined }

export type UpdateTaskDto = InferType<typeof updateTaskSchema>;
// { title?: string | undefined; isCompleted?: boolean | undefined }
```
`InferType` достаёт TypeScript-тип из схемы. Схема — единственный источник правды: поменяли схему, тип поменялся сам.

```ts
export type Task = CreateTaskDto & { id: string; isCompleted: boolean };
// { id: string; title: string; isCompleted: boolean }
```
Задача в базе = то, что пришло на создание, + `id` + `isCompleted` уже обязательный (его подставляет репозиторий через `?? false`).

### Подключаем типы в express/local

- [ ] **Замените ручные типы на типы из контракта.** Самый простой способ — сделать `express/local/src/types/task.type.ts` реэкспортом, тогда импорты в репозиториях менять не нужно:
  ```ts
  export type { CreateTaskDto, Task, UpdateTaskDto } from "@rest/contract";
  ```
  Почему это обязательно: старый `UpdateTaskDto = Partial<Omit<Task, "id">>` при `exactOptionalPropertyTypes` означает `title?: string` (без `undefined`), а yup выдаёт `title?: string | undefined`. Если оставить старые типы, будет ошибка `TS2375` (проверено).
- [ ] **`?? false` в `FileTaskRepository.create` не трогайте.** `.default(false)` мы не используем (в строгом режиме он не работает), поэтому значение по умолчанию подставляет репозиторий.

**Как проверить:**

```bash
pnpm --filter @rest/contract typecheck
pnpm --filter rest-node-express-local exec node --input-type=module -e 'import { createTaskSchema } from "@rest/contract"; console.log(createTaskSchema.validateSync({ title: "a" })); try { createTaskSchema.validateSync({ title: 1, isCompleted: "x" }, { abortEarly: false }) } catch (e) { console.log(e.errors) }'
# { title: 'a' }
# [ 'title must be a string', 'isCompleted must be a boolean' ]
```

---

## Шаг 4. Используем схему в роутах

### Как yup сообщает об ошибке

У схемы два метода проверки:

| Метод | Если всё хорошо | Если ошибка |
|---|---|---|
| `schema.validateSync(value, options)` | возвращает проверенные данные | **бросает** `ValidationError` |
| `schema.validate(value, options)` | Promise с данными | Promise **отклоняется** с `ValidationError` |

У нас нет асинхронных проверок, поэтому берём `validateSync`. Ошибку ловим через `try/catch`.

Что внутри `ValidationError`:
- `err.errors` — массив строк-сообщений: `["title must be a string", "isCompleted must be a boolean"]`;
- `err.inner` — массив отдельных ошибок с `path` (имя поля) и `message`, если нужна структура по полям.

Опция `{ abortEarly: false }` — **собрать все ошибки**. Без неё yup остановится на первой.

### Готовый код роутов

`express/local/src/routes/task-route.ts` — замените обработчики `post` и `patch`, остальное не трогайте:

```ts
import { Router } from "express";
import { ValidationError } from "yup";
import { createTaskSchema, updateTaskSchema } from "@rest/contract";
import type { TaskRepository } from "../repositories/task.repository.ts";

export const router = (tasks: TaskRepository) => {
  const router = Router();

  // ... get "/" и get "/:id" без изменений

  router.post("/", async (req, res) => {
    let data;
    try {
      data = createTaskSchema.validateSync(req.body, { abortEarly: false });
    } catch (err) {
      if (ValidationError.isError(err)) {
        res.status(400).json({ message: err.errors.join("; ") });
        return;
      }
      throw err;
    }

    const task = await tasks.create(data);
    res.status(201).json({ task });
  });

  router.patch("/:id", async (req, res) => {
    const { id } = req.params;

    let data;
    try {
      data = updateTaskSchema.validateSync(req.body, { abortEarly: false });
    } catch (err) {
      if (ValidationError.isError(err)) {
        res.status(400).json({ message: err.errors.join("; ") });
        return;
      }
      throw err;
    }

    const { title, isCompleted } = data;
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

Этот код проверен tsc с вашими настройками и настоящими типами Express.

### Разбор

```ts
let data;
try {
  data = createTaskSchema.validateSync(req.body, { abortEarly: false });
```
`let data` объявлен **снаружи** `try`, потому что данные нужны после него. TypeScript сам выведет тип `data` из того, что вернула схема (`CreateTaskDto`). Ручные проверки `typeof title !== "string"` и `req.body ?? {}` больше не нужны — всё это делает схема.

```ts
} catch (err) {
  if (ValidationError.isError(err)) {
    res.status(400).json({ message: err.errors.join("; ") });
    return;
  }
```
`ValidationError.isError(err)` — «это ошибка валидации?». Если да — отвечаем 400 и выходим. `err.errors.join("; ")` склеивает все сообщения в одну строку, чтобы формат остался вашим `{ message }`.

```ts
  throw err;
}
```
Если ошибка **не** валидационная (что-то сломалось по-настоящему), бросаем её дальше. Express 5 передаст её в ваш `errorHandler` → 500. Без этой строки такая ошибка тихо пропадёт, а TypeScript ещё и пожалуется, что `data` может быть не присвоена.

```ts
const task = await tasks.create(data);
```
`data` здесь уже проверенная и с правильным типом.

**Почему ловим в роуте, а не отдаём в `errorHandler`.** У `ValidationError` нет поля `status`, а ваш `errorHandler` смотрит на `err.status ?? 500`. Ошибка клиента превратилась бы в 500. Можно было бы научить `errorHandler` узнавать `ValidationError`, но вы хотите оставить его простым.

### Если `try/catch` надоест

Одинаковый блок в двух роутах можно вынести в функцию. Это не обязательно, но полезно увидеть:

```ts
import { ValidationError, type Schema } from "yup";

const validate = <T>(schema: Schema<T>, body: unknown) => {
  try {
    return { data: schema.validateSync(body, { abortEarly: false }) };
  } catch (err) {
    if (ValidationError.isError(err)) return { error: err.errors.join("; ") };
    throw err;
  }
};

// в роуте:
const result = validate(createTaskSchema, req.body);
if ("error" in result) {
  res.status(400).json({ message: result.error });
  return;
}
const task = await tasks.create(result.data);
```

---

## Шаг 5. Проверки

- [ ] Типы и сборка:
  ```bash
  pnpm turbo run typecheck build --filter=rest-node-express-local...
  ```
- [ ] Ответы, которые должны прийти (поведение схемы проверено, сообщения как в каркасе выше):

| Запрос | Ответ |
|---|---|
| `POST {"title":"Learn yup"}` | `201`, `isCompleted: false` (из репозитория, `?? false`) |
| `POST {"title":"   "}` | `400 title must be a non-empty string` |
| `POST {"title":1}` | `400` (текст из `.typeError()`, без него `title must be a \`string\` type…`) |
| `POST {"title":"x","isCompleted":"true"}` | `400` — strict, никаких `"true"` → `true` |
| `POST {"title":"x","foo":1}` | `400 this field has unspecified keys: foo` |
| `POST {}` | `400 title is required` |
| `POST {"title":1,"isCompleted":"x"}` | `400` с **двумя** сообщениями (`abortEarly: false`) |
| `PATCH {}` | `400 at least one field is required` |
| `PATCH {"isCompleted":false}` | `200`, `title` не изменился |
| `PATCH /missing {"title":"ok"}` | `404 Task missing not found` |

> ⚠️ `title` в strict-режиме **не обрезается**: `"  a  "` сохранится как есть (сейчас у вас так же). Если хотите обрезать — `title.trim()` руками в роуте перед сохранением, или отказаться от strict (см. альтернативу выше).

---

## zod или yup — коротко

| | zod 4 | yup 1 |
|---|---|---|
| Приведение типов | нет (проверяет как есть) | да, по умолчанию; выключается `.strict()` |
| Лишние поля | вырезает по умолчанию | оставляет по умолчанию; `.noUnknown()` / `stripUnknown` |
| `.trim()` | обрезает | обрезает; в strict — только проверяет |
| `.default()` | работает | в strict не работает |
| Результат | `safeParse` → `{ success, data, error }` | `validateSync` бросает / `validate` → Promise |
| Типы | `z.infer`, `z.input`, `z.output` | `InferType` |
| Где чаще | бэкенд, tRPC, Nest (`nestjs-zod`), формы | исторически формы (Formik), фронтенд |

Для API в этом проекте **проще zod**: он изначально строгий, и не нужно помнить про strict-ловушки. yup стоит попробовать, чтобы увидеть разницу «каст → проверка» против «только проверка».

---

## Типичные ошибки

- **Забыли `.strict()`:** `"true"` и `123` молча проходят.
- **Забыли `.required()` на объекте:** запрос без тела проходит валидацию, `data === undefined`.
- **`.trim()` в strict-режиме** ругается `must be a trimmed string` вместо того, чтобы обрезать.
- **`.default(false)` в strict-режиме** ничего не делает. Убрали `?? false` из репозитория — задачи без `isCompleted` сохраняются без поля.
- **`validate` без `await`:** в роуте приходит Promise, а не данные. Используйте `validateSync` или `await schema.validate(...)`.
- **Не перебросили чужую ошибку** в `catch` (`throw err`): реальная ошибка сервера тихо пропадает.
- **`ValidationError` уходит в `errorHandler`:** 500 вместо 400.
- **Старые ручные типы + `exactOptionalPropertyTypes`:** `TS2375`. Берите типы из `InferType`.
