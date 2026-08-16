import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import examRoutes from "./routes/exams";
import questionRoutes from "./routes/questions";
import meditationRoutes from "./routes/meditations";
import logRoutes from "./routes/logs";
import dashboardRoutes from "./routes/dashboard";
import messageRoutes from "./routes/messages";
import postRoutes from "./routes/posts";
import groupRoutes from "./routes/groups";

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
  // Limite relevée pour accepter les messages vocaux encodés en base64
  app.use(express.json({ limit: "20mb" }));

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/auth", authRoutes);
  app.use("/api/users", userRoutes);
  app.use("/api/exams", examRoutes);
  app.use("/api/questions", questionRoutes);
  app.use("/api/meditations", meditationRoutes);
  app.use("/api/logs", logRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/messages", messageRoutes);
  app.use("/api/posts", postRoutes);
  app.use("/api/groups", groupRoutes);

  app.use((req, res) => {
    res.status(404).json({ message: `Route non trouvée: ${req.method} ${req.path}` });
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur interne" });
  });

  return app;
}
