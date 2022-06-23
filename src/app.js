import express, { json } from "express";
import cors from "cors";
import dayjs from "dayjs";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

const TIME_15S = 15 * 1000;
const TIME_10S = 10 * 1000;

const app = express();
app.use(cors());
app.use(json());

const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;

mongoClient.connect().then(() => {
  db = mongoClient.db("projeto12_batepapo_uol_api");
});

app.post("/participants", async (req, res) => {
  // TODO:
  // validação - retornar erro 422 caso falhe
  // caso já exista - retornar erro 409
  const participant = req.body;
  await db.collection("participants").insertOne({ ...participant, lastStatus: Date.now() });
  await db.collection("messages").insertOne({
    from: participant.name,
    to: "Todos",
    text: "entra na sala...",
    type: "status",
    time: dayjs().format("HH:mm:ss"),
  });
  res.sendStatus(201);
});

app.get("/participants", (req, res) => {
  db.collection("participants")
    .find()
    .toArray()
    .then((participants) => res.send(participants));
});

app.post("/messages", (req, res) => {
  // TODO:
  // validação - retornar erro 422 caso falhe
  const message = req.body;
  const fromUser = req.header("User");
  db.collection("messages")
    .insertOne({
      from: fromUser,
      ...message,
      time: dayjs().format("HH:mm:ss"),
    })
    .then(() => {
      res.sendStatus(201);
    });
});

app.get("/messages", (req, res) => {
  // TODO:
  // Limitar as mensagens de acordo com o usuário

  const limit = parseInt(req.query.limit);
  const user = req.header("User");

  if (limit) {
    db.collection("messages")
      .find()
      .limit(limit)
      .toArray()
      .then((messages) => res.send(messages));

    return;
  }

  db.collection("messages")
    .find()
    .toArray()
    .then((messages) => res.send(messages));
});

app.post("/status", async (req, res) => {
  const user = req.header("User");
  const validateUser = await db.collection("participants").findOne({ name: user });
  if (!validateUser) {
    res.sendStatus(404);
    return;
  }
  await db.collection("participants").updateOne({ name: user }, { $set: { lastStatus: Date.now() } });
  res.sendStatus(200);
});

setInterval(async () => {
  console.log(await db.collection("participants").deleteMany({ lastStatus: { $lt: Date.now() - TIME_10S } }));
}, TIME_15S);

app.listen(5000, () => {
  console.log(`listening on port 5000`);
});
