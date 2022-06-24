import express, { json } from "express";
import cors from "cors";
import dayjs from "dayjs";
import { stripHtml } from "string-strip-html";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import joi from "joi";
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
  const participantSchema = joi.object({
    name: joi.string().required(),
  });
  const participant = req.body;
  const participantValidation = participantSchema.validate(participant, { abortEarly: true });
  if (participantValidation.error) {
    res.sendStatus(422);
    return;
  }
  participant.name = stripHtml(participant.name).result.trim();
  const isParticipantAlreadyLogged = await db.collection("participants").findOne({ name: participant.name });
  if (isParticipantAlreadyLogged) {
    res.sendStatus(409);
    return;
  }
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

app.post("/messages", async (req, res) => {
  const messageSchema = joi.object({
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().required().valid("message", "private_message"),
  });
  const message = req.body;
  const fromUser = req.header("User");
  const messageValidation = messageSchema.validate(message);
  const userExist = await db.collection("participants").findOne({ name: fromUser });
  if (messageValidation.error || !userExist) {
    res.sendStatus(422);
    return;
  }
  message.to = stripHtml(message.to).result.trim();
  message.text = stripHtml(message.text).result.trim();
  message.type = stripHtml(message.type).result.trim();
  await db.collection("messages").insertOne({
    from: fromUser,
    ...message,
    time: dayjs().format("HH:mm:ss"),
  });
  res.sendStatus(201);
});

app.get("/messages", (req, res) => {
  const limit = parseInt(req.query.limit);
  const user = req.header("User");

  if (limit) {
    db.collection("messages")
      .find({ $or: [{ to: { $in: [user, "Todos"] } }, { from: user }] })
      .hint({ $natural: -1 })
      .limit(limit)
      .toArray()
      .then((messages) => res.send(messages.reverse()));

    return;
  }

  db.collection("messages")
    .find({ $or: [{ to: { $in: [user, "Todos"] } }, { from: user }] })
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

app.delete("/messages/:id", async (req, res) => {
  const user = req.header("User");
  const messageID = new ObjectId(req.params.id);
  const message = await db.collection("messages").findOne({ _id: messageID });
  if (!message) {
    res.sendStatus(404);
    return;
  }
  if (user !== message.from) {
    res.sendStatus(401);
    return;
  }
  db.collection("messages").deleteOne({ _id: messageID });
  res.sendStatus(200);
});

app.put("/messages/:id", async (req, res) => {
  const user = req.header("User");
  const time = dayjs().format("HH:mm:ss");
  const messageID = new ObjectId(req.params.id);
  const newMessage = req.body;
  const messageSchema = joi.object({
    to: joi.string().required(),
    text: joi.string().required(),
    type: joi.string().required().valid("message", "private_message"),
  });
  const messageValidation = messageSchema.validate(newMessage);
  if (messageValidation.error) {
    res.sendStatus(422);
    return;
  }
  const oldMessage = await db.collection("messages").findOne({ _id: messageID });
  if (!oldMessage) {
    res.sendStatus(404);
    return;
  }
  if (oldMessage.from !== user) {
    res.sendStatus(401);
    return;
  }
  newMessage.to = stripHtml(newMessage.to).result.trim();
  newMessage.text = stripHtml(newMessage.text).result.trim();
  newMessage.type = stripHtml(newMessage.type).result.trim();
  await db.collection("messages").updateOne({ _id: messageID }, { $set: { ...newMessage, time } });
  res.sendStatus(200);
});

setInterval(async () => {
  const now = Date.now();
  const deleted = await db
    .collection("participants")
    .find({ lastStatus: { $lt: now - TIME_10S } })
    .toArray();
  if (deleted.length > 0) {
    await db.collection("messages").insertMany(
      deleted.map((user) => ({
        from: user.name,
        to: "Todos",
        text: "sai da sala...",
        type: "status",
        time: dayjs(now).format("HH:mm:ss"),
      }))
    );
    await db.collection("participants").deleteMany({ lastStatus: { $lt: now - TIME_10S } });
  }
}, TIME_15S);

app.listen(5000, () => {
  console.log(`listening on port 5000`);
});
