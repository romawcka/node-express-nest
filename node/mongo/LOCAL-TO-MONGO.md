# node/local → node/mongo: пошаговый гайд

Цель: собрать `rest-node-mongo` (порт `3102`) — тот же Task CRUD API, что и везде в репо.

Формула простая:

```text
node/mongo = HTTP-слой из node/local (node:http, без Express)
           + слой данных из express/mongo (Mongoose)
```

Mongoose берём тот же, что в `express/mongo`, чтобы у тройки `*/mongo` отличался **только HTTP-слой**. Тогда сравнение node/mongo ↔ express/mongo ↔ nest/mongo показывает ровно то, что прячет фреймворк, а не разницу между драйверами.

Код пишешь сам. Гайд даёт порядок, скелеты и проверки. Где написано «копируй из node/local» — файл переносится без изменений.

---

## Содержание

0. [Подготовка](#шаг-0-подготовка)
1. [Зависимости](#шаг-1-зависимости)
2. [Конфиг и подключение к Mongo](#шаг-2-конфиг-и-подключение-к-mongo)
3. [HTTP-слой из node/local + `/health` + graceful shutdown](#шаг-3-http-слой-из-nodelocal--health--graceful-shutdown)
4. [Модель и маппер](#шаг-4-модель-и-маппер)
5. [Репозиторий](#шаг-5-репозиторий)
6. [Task router и подключение в app.ts](#шаг-6-task-router-и-подключение-в-appts)
7. [Ошибки Mongoose в error handler](#шаг-7-ошибки-mongoose-в-error-handler)
8. [Жизненный цикл соединения: Mongo упала](#шаг-8-жизненный-цикл-соединения-mongo-упала)
9. [api.http](#шаг-9-apihttp)
10. [Финальные проверки](#шаг-10-финальные-проверки)

Плюс: [чем отличается от node/local](#чем-отличается-от-nodelocal), [чем отличается от express/mongo](#чем-отличается-от-expressmongo), [что прячет Mongoose (нативный драйвер)](#заметка-что-прячет-mongoose-по-сравнению-с-нативным-драйвером-mongodb).

Итоговая структура:

```text
node/mongo/src/
├── index.ts                         connect → listen, graceful shutdown + disconnect
├── app.ts                           цепочка handlers (как в node/local)
├── configs/app.config.ts            PORT, MONGO_URL
├── db/mongoose.ts                   connect / disconnect / isDatabaseConnected   ← из express/mongo
├── models/task.model.ts             Schema + model                               ← из express/mongo
├── mappers/task.mapper.ts           _id → id                                     ← из express/mongo
├── errors/http.error.ts                                                          ← копия node/local
├── helpers/{router,send,json-body}.helper.ts                                     ← копия node/local
├── middlewares/{cors,logger,error-handler}.middleware.ts                         ← копия node/local
├── repositories/
│   ├── task.repository.ts           интерфейс                                    ← копия node/local
│   └── mongoose-task.repository.ts  реализация                                   ← из express/mongo
└── routes/
    ├── task.router.ts                                                            ← копия node/local
    └── health.router.ts             + поле db                                    ← гибрид
```

Все команды ниже запускаются из корня репо (`~/study/node-express-nest`), если не сказано иное.

---

## Шаг 0. Подготовка

```sh
pnpm db:up                                   # docker compose up -d: mongo:8 на 27017, root/root
docker compose ps                            # mongo — running
```

В `node/mongo/` уже лежит `.env`. Проверь, что он совпадает с `.env.example`:

```dotenv
PORT=3102
MONGO_URL=mongodb://root:root@localhost:27017/rest_node?authSource=admin
```

- `rest_node` — своя база для node/mongo (у express/mongo — `rest_express`), данные не пересекаются.
- `authSource=admin` обязателен: пользователь `root` создан в базе `admin` (через `MONGO_INITDB_ROOT_*`). Без этого параметра будет `Authentication failed`.
- Саму базу `rest_node` создавать не нужно: Mongo создаст её при первой вставке.

---

## Шаг 1. Зависимости

`mongoose` уже есть в каталоге `pnpm-workspace.yaml` (`mongoose: ^9.11.4`), так что редактировать каталог не нужно:

```sh
pnpm --filter rest-node-mongo add mongoose@catalog: @rest/contract@workspace:*
```

В `node/mongo/package.json` должно появиться:

```json
"dependencies": {
  "@rest/contract": "workspace:*",
  "mongoose": "catalog:"
}
```

`zod` напрямую не нужен: код вызывает только `CreateTaskSchema.safeParse`, а zod приходит вместе с `@rest/contract`. В node/local он указан, в express/mongo нет. Можешь добавить (`zod@catalog:`) для единообразия с node/local, на работу это не влияет.

**Проверка**

```sh
cd node/mongo && node -e "import('mongoose').then(m => console.log(m.default.version))"   # 9.11.x
```

---

## Шаг 2. Конфиг и подключение к Mongo

Самая маленькая рабочая вещь: процесс, который подключается к базе и пишет об этом в лог. HTTP пока нет.

### `src/configs/app.config.ts`

Как в express/mongo, только дефолты от node/mongo:

```ts
const MONGO_URL_DEFAULT = 'mongodb://root:root@localhost:27017/rest_node?authSource=admin';

const port = parseInt(process.env.PORT ?? '3102');
const mongoUrl = process.env.MONGO_URL ?? MONGO_URL_DEFAULT;

export const config = { port, mongoUrl };
```

### `src/db/mongoose.ts`

Берётся из express/mongo, плюс новая функция `disconnectFromDatabase` (её там нет, потому что в express/mongo нет shutdown).

```ts
import mongoose from 'mongoose';
import { config } from '../configs/app.config.ts';

export const connectToDatabase = async () => {
  try {
    await mongoose.connect(config.mongoUrl, { serverSelectionTimeoutMS: 5000 });
    console.log('Connected to database');
  } catch (error) {
    console.error('Failed to connect to database', error);
    process.exit(1);
  }
};

export const disconnectFromDatabase = async () => {
  // TODO: await mongoose.disconnect(), лог 'Disconnected from database'
  // при ошибке: console.error + process.exitCode = 1 (не exit: дай процессу завершиться самому)
};

export const isDatabaseConnected = () => mongoose.connection.readyState === 1;
```

Что тут важно:

- `serverSelectionTimeoutMS: 5000`. По умолчанию 30 с: если Mongo лежит, `connect()` висит полминуты. С 5000 он падает через 5 с.
- Если первое подключение не удалось, Mongoose **не переподключается сам**: промис `connect()` реджектится, и решение за тобой. Здесь, как в express/mongo, мы выходим с кодом 1. Без базы сервер бесполезен.
- `readyState`: `0` disconnected, `1` connected, `2` connecting, `3` disconnecting (в типах это `mongoose.ConnectionStates`).

### `src/index.ts` (временный)

```ts
import { connectToDatabase } from './db/mongoose.ts';

const startServer = async () => {
  await connectToDatabase();
};

void startServer();
```

**Проверка**

```sh
pnpm --filter rest-node-mongo typecheck
pnpm --filter rest-node-mongo dev
# → Connected to database
```

Заметь: процесс **не завершается**, хотя кода больше нет. Event loop держит открытый пул соединений драйвера. Это понадобится на шаге 3. Останови его через Ctrl+C.

Негативные проверки (в другом терминале):

```sh
docker compose stop mongo
pnpm --filter rest-node-mongo dev
# ~5 с тишины → Failed to connect to database MongooseServerSelectionError: ... → выход 1
docker compose start mongo
```

Можно ещё испортить пароль в `.env`: ошибка будет `Authentication failed`, и придёт она быстро, без таймаута. Потом верни пароль.

---

## Шаг 3. HTTP-слой из node/local + `/health` + graceful shutdown

### 3.1 Копируем без изменений

Эти файлы ничего не знают о хранилище:

```sh
cd node/mongo
mkdir -p src/errors src/helpers src/middlewares src/routes
cp ../local/src/errors/http.error.ts                  src/errors/
cp ../local/src/helpers/router.helper.ts              src/helpers/
cp ../local/src/helpers/send.helper.ts                src/helpers/
cp ../local/src/helpers/json-body.helper.ts           src/helpers/
cp ../local/src/middlewares/cors.middleware.ts        src/middlewares/
cp ../local/src/middlewares/logger.middleware.ts      src/middlewares/
cp ../local/src/middlewares/error-handler.middleware.ts src/middlewares/
```

(Хочешь закрепить — набери их заново. Как они работают, описано в `node/local/EXPLANATION.md`.)

### 3.2 `src/routes/health.router.ts`

Гибрид: `createRouter` из node/local и ответ из express/mongo (`{ status, db }`). Проверку соединения передаём функцией, чтобы роутер не импортировал mongoose:

```ts
import { createRouter } from '../helpers/router.helper.ts';
import { sendJson } from '../helpers/send.helper.ts';

export const createHealthRouter = (isDbConnected: () => boolean) =>
  createRouter([
    {
      method: 'GET',
      path: '/health',
      handler: (_req, res) => sendJson(res, 200, { status: 'ok', db: /* TODO: 'up' | 'down' */ }),
    },
  ]);
```

Статус остаётся `200`, даже когда `db: 'down'`: так делает express/mongo. Для k8s readiness обычно отдают 503, но здесь держим одинаковое поведение в тройке.

### 3.3 `src/app.ts` (пока без tasks)

Это `app.ts` из node/local без репозитория и task-роутера:

```ts
import type { RequestListener } from 'node:http';
import { isDatabaseConnected } from './db/mongoose.ts';
import type { Handler } from './helpers/router.helper.ts';
import { sendJson } from './helpers/send.helper.ts';
import { cors } from './middlewares/cors.middleware.ts';
import { errorHandler } from './middlewares/error-handler.middleware.ts';
import { logger } from './middlewares/logger.middleware.ts';
import { createHealthRouter } from './routes/health.router.ts';

const notFound: Handler = (_req, res) => {
  sendJson(res, 404, { message: 'Not Found' });
  return true;
};

const handlers = [cors, logger, createHealthRouter(isDatabaseConnected), notFound];

export const app: RequestListener = async (req, res) => {
  // копия из node/local: try { for … if (await handler(req, res)) return; } catch → errorHandler
};
```

### 3.4 `src/index.ts`: connect → listen, shutdown → close → disconnect

Это `index.ts` из node/local с двумя изменениями:

1. `listen` вызывается **после** `await connectToDatabase()`.
2. В shutdown после `server.close` идёт `disconnectFromDatabase()`.

```ts
import { createServer } from 'node:http';
import { app } from './app.ts';
import { config } from './configs/app.config.ts';
import { connectToDatabase, disconnectFromDatabase } from './db/mongoose.ts';

const server = createServer(app);

server.on('error', (err) => {
  // как в node/local: лог + process.exit(1)
});

const shutdown = (signal: NodeJS.Signals) => {
  console.log(`${signal} received, closing server`);

  server.close(async (err) => {
    if (err) {
      console.error(err);
      process.exitCode = 1;
    }
    // TODO: await disconnectFromDatabase();
  });

  server.closeIdleConnections();

  setTimeout(() => server.closeAllConnections(), 10_000).unref();
};

const startServer = async () => {
  await connectToDatabase();

  server.listen(config.port, () => console.log(`Server is running on port: ${config.port}`));

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
};

void startServer();
```

Почему именно так:

- **Connect до listen.** Если начать слушать порт раньше, первые запросы попадут в буфер Mongoose (`bufferCommands`, по умолчанию включён). Mongoose складывает операции в очередь, пока соединения нет, и через `bufferTimeoutMS` (10 с) отдаёт ошибку, то есть клиент получит 500 после 10 секунд ожидания. Порт открывается, только когда сервер реально готов.
- **Disconnect внутри колбэка `server.close`, а не сразу.** Колбэк вызывается, когда все HTTP-соединения закрыты, то есть in-flight запросы уже получили ответ. Если закрыть Mongo раньше, они упадут с 500.
- **Без `disconnect` процесс не завершится.** В node/local хватало `server.close`: после него event loop пустой. Здесь его держит пул соединений драйвера (см. наблюдение на шаге 2). Обработчик `process.once('SIGINT')` заменяет поведение по умолчанию (убить процесс), поэтому после первого Ctrl+C процесс просто «повиснет».
- Сигналы подписываются после `listen`: если нажать Ctrl+C во время connect, сработает дефолтное «убить сразу», а аккуратно закрывать пока нечего.
- `mongoose.disconnect()` закрывает все соединения Mongoose. В Mongoose 9 он возвращает `Promise<void>`, колбэков нет. Эквивалент для одного соединения — `mongoose.connection.close()`.

**Проверка**

```sh
pnpm --filter rest-node-mongo dev
# Connected to database
# Server is running on port: 3102

curl -i localhost:3102/health     # 200 {"status":"ok","db":"up"}
curl -i localhost:3102/tasks      # 404 {"message":"Not Found"}   (tasks ещё нет)
curl -i -X OPTIONS localhost:3102/tasks -H 'Access-Control-Request-Headers: content-type'   # 204
```

Ctrl+C в терминале с dev:

```text
SIGINT received, closing server
Disconnected from database
```

После этого процесс завершается. **Эксперимент:** закомментируй `await disconnectFromDatabase()` и нажми Ctrl+C. Процесс зависнет, и убить его можно только вторым Ctrl+C. Потом верни строку.

---

## Шаг 4. Модель и маппер

Слой данных переносится из express/mongo один в один. Рекомендую набрать руками: это главное новое в пакете.

### `src/models/task.model.ts`

```ts
import { model, Schema, type InferSchemaType } from 'mongoose';

const taskSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    isCompleted: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, versionKey: false },
);

export type TaskDocument = InferSchemaType<typeof taskSchema>;
export const TaskModel = model('Task', taskSchema);
```

- `model('Task', …)` → коллекция `tasks`: Mongoose приводит имя к нижнему регистру и ставит во множественное число.
- `timestamps: true` добавляет `createdAt`/`updatedAt` и сам обновляет `updatedAt` при апдейтах. Наружу они не отдаются (см. маппер), но нужны для сортировки.
- `versionKey: false` убирает поле `__v`.
- `required`/`trim`/`default` дублируют zod. Основная валидация в контракте, схема — вторая линия защиты на уровне хранилища.
- `InferSchemaType` выводит TS-тип из схемы, поэтому писать интерфейс руками не нужно.

### `src/mappers/task.mapper.ts`

```ts
import type { TaskDto } from '@rest/contract';
import type { Types } from 'mongoose';
import type { TaskDocument } from '../models/task.model.ts';

type TaskWithId = TaskDocument & { _id: Types.ObjectId };

export const toTaskDto = (task: TaskWithId): TaskDto => ({
  // TODO: id из _id (ObjectId → 24-символьная hex-строка: .toHexString())
  // TODO: title, isCompleted — явно, чтобы createdAt/updatedAt не утекли в API
});
```

Зачем маппер, если у документа Mongoose и так есть виртуальное поле `id`:

- Репозиторий читает через `.lean()`, а lean-объекты — это POJO **без** виртуальных полей, геттеров и методов. `id` у них нет, есть только `_id: ObjectId`.
- `ObjectId` — объект. `JSON.stringify` превратит его в строку, но тип `TaskDto.id: string` честно гарантирует только явное `.toHexString()`.
- Маппер — единственное место, где Mongo-форма (`_id`, timestamps) превращается в контракт (`{ id, title, isCompleted }`).

Маппер принимает и lean-объект (`findById().lean()`), и полный документ (результат `TaskModel.create`). У обоих есть `_id`, `title` и `isCompleted`.

**Проверка**

```sh
pnpm --filter rest-node-mongo typecheck    # без ошибок
```

Сервер по-прежнему работает, `/health` → `db: up`.

---

## Шаг 5. Репозиторий

### `src/repositories/task.repository.ts`

Копия из node/local (в express/mongo он такой же):

```sh
# из node/mongo
mkdir -p src/repositories
cp ../local/src/repositories/task.repository.ts src/repositories/
```

### `src/repositories/mongoose-task.repository.ts`

Скелет (полная версия — `express/mongo/src/repositories/mongoose-task.repository.ts`, но сначала попробуй сам):

```ts
import type { CreateTaskDto, UpdateTaskDto } from '@rest/contract';
import { isObjectIdOrHexString } from 'mongoose';
import { toTaskDto } from '../mappers/task.mapper.ts';
import { TaskModel } from '../models/task.model.ts';
import type { TaskRepository } from './task.repository.ts';

export class MongooseTaskRepository implements TaskRepository {
  async findAll() {
    // TaskModel.find().sort({ createdAt: -1 }).lean() → map(toTaskDto)
  }

  async findById(id: string) {
    if (!isObjectIdOrHexString(id)) return undefined;
    // TaskModel.findById(id).lean() → task ? toTaskDto(task) : undefined
  }

  async create(data: CreateTaskDto) {
    // TaskModel.create(data) → toTaskDto
  }

  async update(id: string, data: UpdateTaskDto) {
    if (!isObjectIdOrHexString(id)) return undefined;
    // TaskModel.findByIdAndUpdate(id, data, { returnDocument: 'after' }).lean()
  }

  async delete(id: string) {
    if (!isObjectIdOrHexString(id)) return false;
    // TaskModel.deleteOne({ _id: id }) → Boolean(deletedCount)
  }
}
```

Разберём, что тут Mongo-специфичное.

**Невалидный id → 404 (как в express/mongo).** Охрана `isObjectIdOrHexString(id)` стоит в репозитории: `GET /tasks/1` возвращает `undefined`, и роутер отвечает `404 { message: 'Task 1 not found' }`. Логика та же, что в node/local: «не uuid» → просто не найдено. Без охраны `findById('1')` бросит `CastError` (Mongoose не может привести `'1'` к ObjectId), и клиент получит 500.

**`isObjectIdOrHexString` vs `isValidObjectId`.** `isValidObjectId` возвращает `true` для всего, что Mongoose *может* привести к ObjectId: для любой 12-символьной строки (`'0123456789ab'`), для чисел и для документов. `isObjectIdOrHexString` пропускает только экземпляр `ObjectId` или 24-символьную hex-строку, а это ровно то, что мы отдаём наружу как `id`. Берём его.

**`lean()`.** Без него запрос возвращает гидратированный документ: change tracking, геттеры, `save()` и прочее. Для read-only API это лишняя работа. С `lean()` получаем POJO, а тип `_id` остаётся `Types.ObjectId`, поэтому маппер типизируется.

**`findByIdAndUpdate(id, data, { returnDocument: 'after' })`.**

- По умолчанию `findOneAndUpdate`/`findByIdAndUpdate` возвращают документ **до** апдейта, и PATCH отдал бы старые данные.
- Старый вариант `{ new: true }` (и `returnOriginal: false`) в Mongoose 9 помечен `@deprecated`. Используй `returnDocument: 'after'`, как в express/mongo. Это имя совпадает с опцией нативного драйвера.
- `data` = `{ isCompleted: true }` без `$set`: Mongoose сам заворачивает поля верхнего уровня в `$set` и приводит типы. Нативный драйвер так не делает (см. заметку в конце).
- Update validators по умолчанию **выключены** (`runValidators: false`), то есть `required` из схемы при апдейте не проверяется. Нам это не мешает, потому что `UpdateTaskSchema` уже всё проверил.
- `updatedAt` обновится сам (`timestamps`).

**`deleteOne({ _id: id })`.** Строку `id` Mongoose сам приведёт к ObjectId. `deletedCount` равен 0 или 1, отсюда `Boolean(...)`.

**Очереди записи больше нет.** `#mutate`/`#queue` из `FileTaskRepository` нужны были потому, что файл переписывается целиком (read-modify-write). Здесь каждая операция атомарна на уровне документа внутри Mongo, и параллельные POST не затирают друг друга.

**Проверка**

```sh
pnpm --filter rest-node-mongo typecheck    # без ошибок
```

Репозиторий пока нигде не используется, его подключаем на следующем шаге.

---

## Шаг 6. Task router и подключение в app.ts

### `src/routes/task.router.ts`

**Копия из node/local без единой правки:**

```sh
cp ../local/src/routes/task.router.ts src/routes/   # из node/mongo
```

Это главный результат абстракции `TaskRepository`: роутер зависит от интерфейса и не знает, что под ним Mongo. Сообщения (`Task ${id} not found`, тексты zod), коды и формы ответов (`{ task }`, `{ tasks }`, `{ message }`) совпадают автоматически.

### `src/app.ts`

Добавь репозиторий и роутер в цепочку, порядок как в node/local:

```ts
import { MongooseTaskRepository } from './repositories/mongoose-task.repository.ts';
import { createTaskRouter } from './routes/task.router.ts';

const taskRepository = new MongooseTaskRepository();

const handlers = [cors, logger, createTaskRouter(taskRepository), createHealthRouter(isDatabaseConnected), notFound];
```

Создавать репозиторий и модель на уровне модуля (до connect) безопасно: `model()` только регистрирует схему, к базе он не обращается.

**Проверка** (`pnpm --filter rest-node-mongo dev`, затем в другом терминале):

```sh
B=localhost:3102

curl -s $B/tasks                                                             # {"tasks":[]}
curl -si -X POST $B/tasks -H 'Content-Type: application/json' -d '{"title":"  Buy milk  "}'
# 201 {"task":{"id":"<24 hex>","title":"Buy milk","isCompleted":false}}   ← trim, default
ID=<id из ответа>

curl -si $B/tasks/$ID                                                        # 200 {"task":{…}}
curl -si -X PATCH $B/tasks/$ID -H 'Content-Type: application/json' -d '{"isCompleted":true}'
# 200 {"task":{…,"isCompleted":true}}   ← уже новое значение (returnDocument: 'after')
curl -si -X PATCH $B/tasks/$ID -H 'Content-Type: application/json' -d '{}'  # 400 at least one field is required
curl -si -X DELETE $B/tasks/$ID                                              # 204
curl -si -X DELETE $B/tasks/$ID                                              # 404 Task <id> not found

curl -si $B/tasks/1                                                          # 404 {"message":"Task 1 not found"}
curl -si $B/tasks/0123456789ab                                               # 404 (12 символов — охрана не пропускает)
curl -si $B/tasks/000000000000000000000000                                   # 404 (валидный ObjectId, такой задачи нет)
curl -si $B/tasks/%E0%A4%A                                                   # 400 Failed to decode param …
curl -si -X POST $B/tasks -H 'Content-Type: application/json' -d '{"title":""}'   # 400 title must be a non-empty string
curl -si -X POST $B/tasks -H 'Content-Type: text/plain' -d '{"title":"x"}'        # 415
```

Порядок в `GET /tasks`: новые сверху (`sort({ createdAt: -1 })`). В node/local было наоборот, в порядке вставки в массив.

Посмотреть, что реально лежит в базе (только чтение):

```sh
docker compose exec mongo mongosh -u root -p root --quiet \
  --eval 'db.getSiblingDB("rest_node").tasks.find().toArray()'
# _id: ObjectId(...), title, isCompleted, createdAt, updatedAt; без __v
```

Сравни с ответом API: `_id` превратился в `id`, timestamps скрыты. Это и есть работа маппера.

---

## Шаг 7. Ошибки Mongoose в error handler

Сейчас `error-handler.middleware.ts` — копия из node/local: всё, что не `HttpError`, превращается в `500 Something went wrong!`. В express/mongo то же самое (`err.status ?? 500`), специальной обработки ошибок Mongoose там **нет**.

Какие ошибки Mongoose вообще возможны:

| Ошибка                         | Когда возникает                                               | Достижима у нас?                                         |
| ------------------------------ | ------------------------------------------------------------- | -------------------------------------------------------- |
| `mongoose.Error.CastError`       | значение не приводится к типу схемы (`findById('1')`)         | нет: охрана `isObjectIdOrHexString` в репозитории        |
| `mongoose.Error.ValidationError` | `create`/`save` нарушает схему (`required`, пустой `title`)   | нет: zod отсекает раньше, а update validators выключены  |
| `MongoServerSelectionError` и т. п. | база недоступна                                          | да → 500, и это правильно                                |

Значит, **поведение express/mongo повторяется и без изменений**: для любого достижимого запроса ответы одинаковые.

Для понимания (и как страховку) можешь добавить маппинг в error handler:

```ts
import mongoose from 'mongoose';

const toStatus = (err: unknown) => {
  if (err instanceof HttpError) return err.status;
  // TODO: CastError → 400 (или 404, если хочешь трактовать «кривой id» как «нет такого»)
  // TODO: ValidationError → 400
  return 500;
};
// message: для 4xx — err.message, для 5xx — 'Something went wrong!'
```

- Импортируй `mongoose` по умолчанию и пиши `mongoose.Error.CastError`. Не делай `import { Error } from 'mongoose'`: это затенит глобальный `Error`.
- `err.message` у `CastError` выглядит как `Cast to ObjectId failed for value "1" (type string) at path "_id" for model "Task"`. Это утечка внутренностей. Если маппишь, лучше дать своё сообщение.
- Компромисс: так HTTP-слой начинает знать про Mongoose. Чище переводить ошибки в репозитории (как сейчас: охрана → `undefined` → 404).

**Эксперимент (потом откатить):** убери охрану в `findById` и вызови `curl -si localhost:3102/tasks/1`. Без маппинга будет 500, в stderr `CastError`. С маппингом — 400. Верни охрану. Ответы должны совпадать с express/mongo: `404 Task 1 not found`.

---

## Шаг 8. Жизненный цикл соединения: Mongo упала

Сводка всех сценариев (проверь каждый руками):

| Сценарий                               | Что происходит                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Mongo не запущена при старте           | `connect()` реджектится через 5 с (`serverSelectionTimeoutMS`) → лог → `process.exit(1)`, порт не открыт   |
| Неверный пароль / нет `authSource`     | быстрый реджект `Authentication failed` → exit 1                                                            |
| Mongo упала во время работы            | `/health` → через несколько секунд `db: "down"`; запросы к `/tasks` висят до таймаута (5–10 с) → 500        |
| Mongo вернулась                        | драйвер переподключается сам → `db: "up"`, запросы снова работают, рестарт не нужен                         |
| Ctrl+C / SIGTERM                       | `server.close` → дождаться in-flight → `mongoose.disconnect()` → процесс завершается сам                    |

Переподключение после первого **успешного** connect драйвер делает сам. Если не удался первый connect, переподключения нет: отсюда `exit(1)`.

```sh
# терминал 1: pnpm --filter rest-node-mongo dev
docker compose stop mongo
curl -s localhost:3102/health                      # через несколько секунд: {"status":"ok","db":"down"}
time curl -si localhost:3102/tasks                 # ждёт секунды → 500 {"message":"Something went wrong!"}
docker compose start mongo
curl -s localhost:3102/health                      # {"status":"ok","db":"up"}
```

Под `tsx watch` после `exit(1)` процесс-наблюдатель остаётся жив и перезапустит приложение при сохранении файла. Под `pnpm start` процесс просто завершится с кодом 1 (`echo $?` → 1).

---

## Шаг 9. api.http

Скопируй `node/local/api.http` и поправь:

```http
@baseUrl = http://localhost:3102
@path = tasks
# ObjectId: возьми из ответа POST
@existingId = <24 hex>
@updatedId = <24 hex>
@deletedId = <24 hex>
@missingId = 000000000000000000000000
```

Что изменить и добавить:

- `### Get task: not a uuid → 404` переименуй в `not an ObjectId → 404` (`/tasks/1`).
- Добавь `### Get task: 12-char string → 404` (`/tasks/0123456789ab`). Этот кейс показывает, зачем `isObjectIdOrHexString`.
- `### Health` → ожидаем `{ "status": "ok", "db": "up" }`.
- Остальные кейсы (400/413/415, percent-encoding, CORS preflight, PUT → 404, unknown route) переносятся без изменений: это HTTP-слой.

Если пользуешься VS Code REST Client, id можно не копировать руками: пометь запрос `# @name createTask` и ссылайся на `{{createTask.response.body.task.id}}`. Для JetBrains HTTP Client нужен response handler (`client.global.set(...)`). Делать необязательно, в node/local id заданы вручную.

---

## Шаг 10. Финальные проверки

```sh
pnpm --filter rest-node-mongo typecheck
pnpm --filter rest-node-mongo build        # → node/mongo/dist
pnpm --filter rest-node-mongo start        # node --env-file=.env dist/index.js — то же, что dev
```

Чек-лист:

- [ ] `/health` → `{"status":"ok","db":"up"}`
- [ ] CRUD и все ошибки из `api.http` дают ожидаемые коды
- [ ] `GET /tasks/1` → 404 `Task 1 not found` (как в express/mongo)
- [ ] PATCH возвращает **обновлённую** задачу
- [ ] в ответах нет `_id`, `createdAt`, `updatedAt`, `__v`
- [ ] Mongo выключена → старт падает с exit 1 через ~5 с
- [ ] Ctrl+C → `Disconnected from database`, процесс завершается сам
- [ ] 10 параллельных POST → все 201 (цикл из `node/local/EXPLANATION.md`, порт 3102)

Сравнение бок о бок с express/mongo (`pnpm --filter rest-node-express-mongo dev`, порт 3202, база `rest_express`, данные свои):

```sh
for p in 3102 3202; do echo "== $p"; curl -si localhost:$p/tasks/1 | head -1; curl -s localhost:$p/tasks/1; echo; done
for p in 3102 3202; do echo "== $p"; curl -si -X POST localhost:$p/tasks -H 'Content-Type: text/plain' -d '{"title":"x"}' | head -1; done
for p in 3102 3202; do echo "== $p"; curl -s localhost:$p/nope; echo; done
```

Расхождения должны быть только из таблицы ниже (HTTP-слой).

---

## Чем отличается от node/local

| Что                     | node/local                                    | node/mongo                                                         |
| ----------------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| Хранилище               | `FileTaskRepository`, `db.json`               | `MongooseTaskRepository`, коллекция `rest_node.tasks`              |
| Конфиг                  | `PORT=3101`, `DB`                             | `PORT=3102`, `MONGO_URL`                                           |
| id                      | `randomUUID()` (UUID v4)                      | `ObjectId` → 24 hex через маппер                                   |
| Кривой id               | не найден → 404                               | охрана `isObjectIdOrHexString` → 404 (иначе `CastError` → 500)     |
| Конкурентность          | очередь `#mutate` + атомарный `rename`        | не нужна: атомарность документа в Mongo                            |
| Порядок `GET /tasks`    | порядок вставки                               | `createdAt` по убыванию (новые сверху)                             |
| Старт                   | сразу `listen`                                | `await connect` → `listen`; нет базы → exit 1                      |
| Shutdown                | `server.close`                                | `server.close` → `mongoose.disconnect()` (иначе процесс не выйдет) |
| `/health`               | `{ status }`                                  | `{ status, db: 'up' \| 'down' }`                                   |
| Новые папки             | —                                             | `db/`, `models/`, `mappers/`                                       |
| Без изменений           | errors, helpers, middlewares, `task.router.ts`, `task.repository.ts`, цепочка в `app.ts` | ←                                  |

## Чем отличается от express/mongo

| Что                     | express/mongo                                       | node/mongo                                                    |
| ----------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| Сервер                  | `express()`, `app.listen(port, cb(err))`            | `createServer(app)` + событие `'error'`                       |
| Роутинг                 | `Router()`, `app.use('/tasks', …)`, `req.params.id` | `createRouter`, полные пути, позиционный `id`                 |
| Тело                    | `express.json()`                                    | `readJson` (100kb, 413, 415)                                  |
| CORS / логи             | `cors()`, `morgan('tiny')`                          | handlers `cors`, `logger` из node/local                       |
| Ошибки                  | `ErrorRequestHandler`, `err.status ?? 500`          | `try/catch` в `app` + `errorHandler` с `HttpError`            |
| 404 на неизвестный путь | `Not found`                                         | `Not Found` (как в node/local)                                |
| `text/plain` в POST     | 400 (тело пропущено)                                | 415                                                           |
| `HEAD`, `ETag`, `X-Powered-By` | есть                                         | нет                                                           |
| Shutdown                | нет (дефолтный SIGINT)                              | graceful + `mongoose.disconnect()`                            |
| Порт / база             | 3202 / `rest_express`                               | 3102 / `rest_node`                                            |
| **Слой данных**         | `db/`, `models/`, `mappers/`, `repositories/`       | **тот же код** (+ `disconnectFromDatabase`)                   |
| Кривой id, сообщения, формы ответов | 404 `Task 1 not found`, `{ task }`/`{ tasks }`/`{ message }` | то же                              |

Остальные мелкие расхождения HTTP-слоя (`/TASKS`, `//`, charset) те же, что между express/local и node/local: см. таблицу «Behavioral differences» в `node/local/EXPLANATION.md`.

---

## Заметка: что прячет Mongoose по сравнению с нативным драйвером `mongodb`

Альтернатива — пакет `mongodb` (`MongoClient`) без ODM. Здесь мы его **не строим**, но полезно знать, что пришлось бы делать руками:

| Mongoose делает за тебя                                          | С нативным драйвером                                                                                  |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Схема: `required`, `trim`, `default`, типы                       | схемы нет; только zod (или `$jsonSchema`-валидатор коллекции в самой Mongo)                           |
| Приведение типов: строка `id` → `ObjectId` в `findById`/`deleteOne` | `new ObjectId(id)` руками; на кривой строке он **бросает** `BSONError` → нужна та же охрана `ObjectId.isValid`/hex-проверка |
| `CastError` / `ValidationError` с понятными полями               | сырые `MongoServerError` (например, code 121 при нарушении `$jsonSchema`)                             |
| Автообёртка апдейта в `$set`                                     | `updateOne({ _id }, { $set: data })`; без оператора — ошибка «Update document requires atomic operators» |
| `timestamps`                                                     | ставить `createdAt`/`updatedAt` руками в `insertOne`/`$set`                                          |
| Буферизация команд до connect                                    | нет; операции до готовности клиента ведут себя иначе, порядок connect → listen всё равно нужен        |
| `model('Task')` → коллекция `tasks`                              | `client.db('rest_node').collection('tasks')` явно                                                     |
| Документы с виртуальным `id`, `toJSON`                           | только POJO с `_id`; маппер `_id → id` нужен так же (как у нас с `lean()`)                            |
| `mongoose.disconnect()`                                          | `client.close()`; без него процесс тоже не завершится                                                 |

С `lean()` + маппером наш код уже близок к «драйверному» стилю. Если когда-нибудь захочешь сделать `node/mongo` совсем без библиотек, заменить придётся только `db/`, `models/` и `mongoose-task.repository.ts`: интерфейс `TaskRepository` и весь HTTP-слой останутся прежними.
