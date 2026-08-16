import "dotenv/config";
import http from "http";
import { createApp } from "./app";
import { setupSignaling } from "./ws";

const port = Number(process.env.PORT) || 4000;
const app = createApp();
const server = http.createServer(app);
setupSignaling(server);

server.listen(port, () => {
  console.log(`Backend démarré sur le port ${port}`);
});
