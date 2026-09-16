import express from "express";

const app = express();
const port = process.env.PORT || 4000;

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`API server running on port ${port}`);
  });
}

export default app;
