# MongoDB в Docker + express/mongo — пошагово

Все команды — из корня репозитория, если не сказано иначе.

## 1. Docker на macOS
У тебя уже стоят `docker` CLI, `docker-compose` и `colima` (через brew). Не хватает двух вещей: CLI не видит плагин compose, и colima не запущена.
```sh
mkdir -p ~/.docker
# если ~/.docker/config.json уже есть — добавь ключ руками, а не перезаписывай
echo '{ "cliPluginsExtraDirs": ["/opt/homebrew/lib/docker/cli-plugins"] }' > ~/.docker/config.json
colima start            # поднимает VM с Docker (первый раз — пару минут)
```
Проверка: `docker compose version` и `docker ps` (пустая таблица, без ошибок).
Если `Cannot connect to the Docker daemon` → `docker context use colima`. Закончил работать → `colima stop`.
(Альтернатива с GUI — OrbStack: `brew install --cask orbstack`; colima тогда не нужна.)

## 2. Запустить Mongo
```sh
docker compose up -d mongo     # только mongo; pnpm db:up поднимет ещё и postgres
docker compose ps              # mongo — STATUS "Up"
docker compose exec mongo mongosh -u root -p root --eval "db.runCommand({ ping: 1 })"   # → { ok: 1 }
```
- Данные живут в именованном volume `mongo-data` — переживают перезапуск.
- `pnpm db:down` — остановить; `docker compose down -v` — остановить и **стереть данные**.

## 3. (Необязательно) GUI
MongoDB Compass или расширение «MongoDB for VS Code» — строка подключения та же, что в `.env`:
`mongodb://root:root@localhost:27017/rest_express?authSource=admin`

## 4. Драйвер
Берём официальный `mongodb`, не mongoose: сначала видим «сырой» драйвер (ObjectId, `$set`, фильтры), без ODM-магии.
`pnpm add mongodb@catalog:` перепишет `pnpm-workspace.yaml` и сотрёт комментарии — поэтому руками:
- `pnpm-workspace.yaml`, в `catalog:` → `mongodb: ^7.8.0`
- `express/mongo/package.json`, в `dependencies` → `"mongodb": "catalog:"` и `"@rest/contract": "workspace:*"`
```sh
pnpm install
```
Проверка: `ls express/mongo/node_modules/mongodb` существует.

## 5. Скелет приложения
```sh
cd express/mongo
cp -R ../local/src/{routes,middlewares,types} src/
mkdir -p src/repositories src/config
cp ../local/src/repositories/task.repository.ts src/repositories/
cp ../local/src/server.ts ../local/src/index.ts src/
cp ../local/api.http .
```
Как есть: routes, middlewares, types, интерфейс `TaskRepository`. Меняем:
- **config.ts** — `port` (по умолчанию 3202) и `mongoUrl = process.env.MONGO_URL` вместо `db`.
- **server.ts** — подключение к БД асинхронное, поэтому репозиторий создаём снаружи:
  `export const createApp = (tasks: TaskRepository) => { const app = express(); ...; app.use("/tasks", taskRouter(tasks)); ...; return app; }`
  (импорты `config` и `FileTaskRepository` удалить).
- **index.ts** — сначала коннект, потом listen:
```ts
const client = new MongoClient(config.mongoUrl, { serverSelectionTimeoutMS: 5000 });
await client.connect();   // Mongo недоступна → упадём здесь, а не на первом запросе
const db = client.db();   // имя БД из URL → rest_express

const app = createApp(new MongoTaskRepository(db));
const server = app.listen(config.port, (err) => { /* как в local */ });

const shutdown = async () => {
  server.close();
  await client.close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
```

## 6. MongoTaskRepository (`src/repositories/mongo-task.repository.ts`)
```ts
import { type Collection, type Db, ObjectId, type WithId } from "mongodb";

type TaskDoc = Omit<Task, "id">;   // _id: ObjectId драйвер добавит сам (WithId<TaskDoc>)

const toTask = (doc: WithId<TaskDoc>): Task => ({
  id: doc._id.toHexString(), title: doc.title, isCompleted: doc.isCompleted,
});   // наружу — только id-строка, _id никогда не отдаём

const toObjectId = (id: string) => (ObjectId.isValid(id) ? new ObjectId(id) : undefined);
// new ObjectId("123") кидает BSONError → 500; невалидный id = «не найдено» → 404

export class MongoTaskRepository implements TaskRepository {
  #tasks: Collection<TaskDoc>;
  constructor(db: Db) { this.#tasks = db.collection<TaskDoc>("tasks"); }
```
Методы (в каждом, где есть id: `const _id = toObjectId(id); if (!_id) return undefined /* или false */;`):
- **findAll** — `(await this.#tasks.find().toArray()).map(toTask)`
- **findById** — `const doc = await this.#tasks.findOne({ _id }); return doc ? toTask(doc) : undefined;`
- **create** — `const { insertedId } = await this.#tasks.insertOne({ title: data.title, isCompleted: data.isCompleted });`
  `return { id: insertedId.toHexString(), ...data };`
  (передавай в insertOne новый объект: драйвер дописывает в него `_id`.)
- **update** — убрать `undefined` (иначе драйвер запишет `title: null`), потом обновить:
  `const $set = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));`
  `const doc = await this.#tasks.findOneAndUpdate({ _id }, { $set }, { returnDocument: "after" });`
  `return doc ? toTask(doc) : undefined;` — в драйвере v6+ возвращается сам документ или `null`, без `.value`.
- **delete** — `const { deletedCount } = await this.#tasks.deleteOne({ _id }); return deletedCount === 1;`

Проверка: `pnpm --filter rest-node-express-mongo typecheck`.

## 7. Проверить вживую
```sh
pnpm --filter rest-node-express-mongo dev     # "The server is running on port 3202"
```
В `api.http`: `@baseUrl = http://localhost:3202`, id — из ответа POST (24 hex-символа).
- POST → 201, `task.id` вида `6650f1...`, поля `_id` в ответе нет
- `GET /tasks/123` → 404 (невалидный id)
- `GET /tasks/000000000000000000000000` → 404 (валидный, но такого нет)
- PATCH `{ "isCompleted": true }` → `title` не стал `null`
- Данные в базе:
```sh
docker compose exec mongo mongosh -u root -p root rest_express --authenticationDatabase admin --eval "db.tasks.find()"
```

## 8. Типичные ошибки
- `Authentication failed` — в URL нет `?authSource=admin` (root-пользователь живёт в БД admin).
- `ECONNREFUSED` / `Server selection timed out` — контейнер не запущен (`docker compose ps`) или colima остановлена.
- Порт 27017 занят — запущен локальный `mongod` (`brew services stop mongodb-community`) или старый контейнер.
- В ответе есть `_id` — где-то вернул документ без `toTask`.
- 500 на `/tasks/123` — забыл `ObjectId.isValid` перед `new ObjectId`.
- Поменял пароль root в `docker-compose.yml`, а логин по-старому — init-переменные применяются только к пустому volume; нужен `docker compose down -v` (данные сотрутся).
