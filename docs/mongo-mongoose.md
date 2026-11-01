# express/mongo через Mongoose — пошагово

Mongo в Docker поднимается как в [mongo-docker.md](mongo-docker.md), шаги 1–2 (`colima start --dns 1.1.1.1 --dns 8.8.8.8`, потом `docker compose up -d mongo`). Здесь — только подключение через **mongoose** вместо «сырого» драйвера.

Проверено: mongoose **9.11.4**, TypeScript 7.0.2 с флагами из `tsconfig.base.json` — весь код ниже проходит `tsc`. Поведение без базы (вырезание `undefined`, проверка id) проверено запуском; с живой базой — не запускал.

Команды — из корня репозитория.

---

## 1. Что такое mongoose и чем отличается от драйвера

- **Драйвер `mongodb`** — просто отправляет запросы в базу. Что положил, то и лежит.
- **Mongoose** — надстройка над драйвером (ODM). Вы описываете **схему** документа (какие поля, каких типов), по ней создаётся **модель**, и через модель делаете запросы: `TaskModel.find()`, `TaskModel.create(...)`. Mongoose приводит типы по схеме, умеет валидацию, значения по умолчанию, хуки.

Валидация входа у нас уже есть в zod (`@rest/contract`), поэтому схема mongoose здесь описывает только **как документ лежит в базе**.

---

## 2. Установить mongoose

`pnpm add` перепишет `pnpm-workspace.yaml` и сотрёт комментарии, поэтому руками:

- `pnpm-workspace.yaml`, в `catalog:` → `mongoose: ^9.11.4`
- `express/mongo/package.json`, в `dependencies`:
  ```json
  "@rest/contract": "workspace:*",
  "mongoose": "catalog:"
  ```
  (плюс `express`, `cors`, `morgan` — они там уже есть)

```sh
pnpm install
```

Отдельно ставить `mongodb` не нужно — mongoose тянет драйвер сам.

---

## 3. Скелет: копируем из express/local

```sh
cd express/mongo
cp -R ../local/src/{routes,middlewares,types,config} src/
mkdir -p src/repositories
cp ../local/src/repositories/task.repository.ts src/repositories/
cp ../local/src/server.ts ../local/src/index.ts src/
cp ../local/api.http .
cd ../..
```

Без изменений остаются: `routes/`, `middlewares/`, `types/`, `repositories/task.repository.ts` (интерфейс). Меняем `config`, `server.ts`, `index.ts` и пишем два новых файла: модель и репозиторий.

В `api.http` поменяйте порт: `@baseUrl = http://localhost:3202`.

---

## 4. `src/config/config.ts`

```ts
const port = parseInt(process.env.PORT ?? "3202");
const mongoUrl =
  process.env.MONGO_URL ??
  "mongodb://root:root@localhost:27017/rest_express?authSource=admin";

export const config = { port, mongoUrl };
```

`MONGO_URL` уже есть в `express/mongo/.env`. `rest_express` в URL — имя базы, `authSource=admin` — пользователь `root` живёт в базе `admin`.

---

## 5. `src/server.ts` → функция `createApp`

Раньше `server.ts` сам создавал `FileTaskRepository`. Теперь репозиторий передаём **снаружи**: к базе надо сначала подключиться (это асинхронно), и только потом создавать приложение.

```ts
import cors from "cors";
import express from "express";
import morgan from "morgan";
import { errorHandler } from "./middlewares/error-handler.ts";
import type { TaskRepository } from "./repositories/task.repository.ts";
import { healthRouter, taskRouter } from "./routes/_index.ts";

export const createApp = (tasks: TaskRepository) => {
  const app = express();

  app.use(cors());
  app.use(morgan("tiny"));
  app.use(express.json());

  app.use("/tasks", taskRouter(tasks));
  app.use(healthRouter);
  app.use((_req, res) => res.status(404).json({ message: "Not found" }));
  app.use(errorHandler);

  return app;
};
```

(имена `taskRouter` / `healthRouter` — как у вас в `routes/_index.ts`)

---

## 6. `src/repositories/task.model.ts` — схема и модель

```ts
import { model, Schema, type InferSchemaType } from "mongoose";

const taskSchema = new Schema(
  {
    title: { type: String, required: true },
    isCompleted: { type: Boolean, required: true },
  },
  { versionKey: false },
);

export type TaskDoc = InferSchemaType<typeof taskSchema>;
export const TaskModel = model("Task", taskSchema);
```

Разбор:

- `new Schema({...})` — какие поля у документа. `type: String` — тип (с большой буквы: это JS-конструкторы, а не TS-типы). `required: true` — поле обязательно.
- `{ versionKey: false }` — без этого mongoose добавляет в каждый документ служебное поле `__v`. Нам оно не нужно.
- `_id` описывать не надо: mongoose добавляет его сам (`ObjectId`).
- `InferSchemaType` — TS-тип документа из схемы: `{ title: string; isCompleted: boolean }`. Как `z.infer` в zod.
- `model("Task", taskSchema)` — модель, через неё делаем запросы. Коллекция в базе назовётся `tasks` (mongoose берёт имя модели в нижнем регистре и во множественном числе).

---

## 7. `src/repositories/mongoose-task.repository.ts` — репозиторий

```ts
import { isObjectIdOrHexString, type Types } from "mongoose";
import type { CreateTaskDto, Task, UpdateTaskDto } from "../types/task.type.ts";
import { TaskModel, type TaskDoc } from "./task.model.ts";
import type { TaskRepository } from "./task.repository.ts";

const toTask = (doc: TaskDoc & { _id: Types.ObjectId }): Task => ({
  id: doc._id.toHexString(),
  title: doc.title,
  isCompleted: doc.isCompleted,
});

export class MongooseTaskRepository implements TaskRepository {
  async findAll() {
    const docs = await TaskModel.find().lean();
    return docs.map(toTask);
  }

  async findById(id: string) {
    if (!isObjectIdOrHexString(id)) return undefined;
    const doc = await TaskModel.findById(id).lean();
    return doc ? toTask(doc) : undefined;
  }

  async create(data: CreateTaskDto) {
    const doc = await TaskModel.create(data);
    return toTask(doc);
  }

  async update(id: string, data: UpdateTaskDto) {
    if (!isObjectIdOrHexString(id)) return undefined;
    const doc = await TaskModel.findByIdAndUpdate(id, data, {
      returnDocument: "after",
    }).lean();
    return doc ? toTask(doc) : undefined;
  }

  async delete(id: string) {
    if (!isObjectIdOrHexString(id)) return false;
    const doc = await TaskModel.findByIdAndDelete(id);
    return doc !== null;
  }
}
```

Разбор:

- **`toTask`** — превращает документ из базы в наш `Task`: `_id` (объект `ObjectId`) → `id` (строка). Наружу **никогда** не отдаём `_id`, API должен выглядеть так же, как в `express/local`.
- **`isObjectIdOrHexString(id)`** — проверка, что `id` похож на ObjectId (24 hex-символа). Без неё `GET /tasks/123` → mongoose бросит `CastError` → ваш `errorHandler` вернёт **500**. С ней — «не нашли» → роут вернёт **404**.
  Не путайте с `isValidObjectId`: тот вернёт `true` для **любой** строки из 12 символов и для чисел (проверено: `isObjectIdOrHexString("0123456789ab") === false`).
- **`.lean()`** — вернуть простой JS-объект, а не «живой» документ mongoose (с методами `.save()` и т.д.). Быстрее, и нам больше и не нужно — мы всё равно перекладываем в `Task`.
- **`create(data)`** — создаёт и сохраняет документ. `isCompleted` уже есть в `data` (zod подставил `default(false)`).
- **`findByIdAndUpdate(id, data, { returnDocument: "after" })`**:
  - `data` можно передавать как есть: mongoose сам оборачивает его в `$set` и **вырезает поля со значением `undefined`** (проверено: `{ title: undefined, isCompleted: true }` → `{ $set: { isCompleted: true } }`). Поэтому `PATCH {"isCompleted": true}` не затрёт `title`. С «сырым» драйвером это пришлось бы делать руками.
  - `returnDocument: "after"` — вернуть документ **после** обновления. По умолчанию возвращается старый. Старая запись `{ new: true }` в mongoose 9 работает, но печатает предупреждение «deprecated».
  - Если документа нет — вернёт `null` → мы отдаём `undefined` → роут ответит 404.
- **`findByIdAndDelete`** — вернёт удалённый документ или `null`.

---

## 8. `src/index.ts` — сначала подключиться, потом слушать

```ts
import mongoose from "mongoose";
import { config } from "./config/config.ts";
import { MongooseTaskRepository } from "./repositories/mongoose-task.repository.ts";
import { createApp } from "./server.ts";

await mongoose.connect(config.mongoUrl, { serverSelectionTimeoutMS: 5000 });
console.log("Connected to MongoDB");

const app = createApp(new MongooseTaskRepository());

const server = app.listen(config.port, (err) => {
  if (err) {
    console.error(`Failed to start the server: ${err.message}`);
    process.exit(1);
  }
  console.log(`The server is running on port ${config.port}`);
});

const shutdown = async () => {
  server.close();
  await mongoose.disconnect();
  process.exit(0);
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
```

Разбор:

- **`await` на верхнем уровне** работает, потому что пакет — ES-модуль (`"type": "module"`).
- **`mongoose.connect(...)`** — одно подключение на всё приложение. Модели (`TaskModel`) используют его автоматически, поэтому в репозиторий ничего передавать не нужно.
- **`serverSelectionTimeoutMS: 5000`** — если Mongo не запущена, упадём через 5 секунд с понятной ошибкой, а не через 30.
- **Подключаемся до `listen`** — иначе сервер начнёт принимать запросы, а базы ещё нет.
- **`shutdown`** — на `Ctrl+C` (SIGINT) и при остановке (SIGTERM) закрываем сервер и соединение с базой. `tsx watch` при перезапуске тоже шлёт SIGTERM.

---

## 9. Проверить

```sh
pnpm --filter rest-node-express-mongo typecheck
pnpm --filter rest-node-express-mongo dev
# Connected to MongoDB
# The server is running on port 3202
```

Запросы в `api.http`:

- `POST {"title":"Learn mongoose"}` → 201, `task.id` — 24 hex-символа, поля `_id` и `__v` в ответе **нет**
- `GET /tasks/123` → 404 (невалидный id)
- `GET /tasks/000000000000000000000000` → 404 (валидный, но такого нет)
- `PATCH /tasks/<id> {"isCompleted": true}` → 200, `title` не изменился
- `DELETE` → 204, повторный → 404
- Валидация (`{"title":"   "}`, `{"isCompleted":"true"}`) — 400, как в local: это делает zod в роутах.

Посмотреть данные прямо в базе:

```sh
docker compose exec mongo mongosh -u root -p root rest_express --authenticationDatabase admin --eval "db.tasks.find()"
```

---

## 10. Типичные ошибки

- **`MongooseServerSelectionError` / `ECONNREFUSED`** — контейнер не запущен (`docker compose ps`) или colima остановлена (`colima status`).
- **`Authentication failed`** — в URL нет `?authSource=admin`.
- **500 на `/tasks/123`** — забыли `isObjectIdOrHexString` (`CastError`).
- **В ответе есть `_id` или `__v`** — вернули документ без `toTask` или забыли `versionKey: false`.
- **PATCH возвращает старые данные** — забыли `returnDocument: "after"`.
- **Предупреждение `the new option ... is deprecated`** — используете `{ new: true }`, замените на `returnDocument: "after"`.
- **Запросы висят 10 секунд, потом `buffering timed out`** — модель используется до `mongoose.connect` или подключение не удалось. Mongoose копит запросы, пока ждёт базу.
