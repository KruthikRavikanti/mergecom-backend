const cors = require("cors");
const express = require("express");
const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");

const app = express();
const port = Number(process.env.LEGACY_PORT || 3001);
const allowedOrigins = new Set([
  "https://localhost:3000",
  "https://127.0.0.1:3000",
]);

const excelFilePath = path.join(__dirname, "saved_workbook.json");
const powerPointFilePath = path.join(__dirname, "saved_presentation.json");
const certificateDirectory =
  process.env.MERGECOM_DEV_CERT_DIR ||
  path.join(os.homedir(), ".office-addin-dev-certs");

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin is not allowed by the legacy development server"));
    },
  }),
);
app.use(express.json({ limit: "10mb" }));

function writePrototypeData(filePath, property, body, response) {
  if (!body || !Array.isArray(body[property])) {
    response.status(400).send(`Invalid ${property} format`);
    return;
  }

  fs.writeFileSync(filePath, JSON.stringify(body, null, 2), "utf8");
  console.info(`Legacy ${property} snapshot saved (${body[property].length} items)`);
  response.sendStatus(200);
}

function readPrototypeData(filePath, property, response) {
  if (!fs.existsSync(filePath)) {
    response.json({ [property]: [] });
    return;
  }

  const parsedContent = JSON.parse(fs.readFileSync(filePath, "utf8"));
  console.info(`Legacy ${property} snapshot loaded`);
  response.json(parsedContent);
}

function readHttpsOptions() {
  try {
    return {
      ca: fs.readFileSync(path.join(certificateDirectory, "ca.crt")),
      cert: fs.readFileSync(path.join(certificateDirectory, "localhost.crt")),
      key: fs.readFileSync(path.join(certificateDirectory, "localhost.key")),
    };
  } catch (error) {
    throw new Error(
      `Development certificate files are unavailable. Run npm run legacy:certs first. ${error.message}`,
    );
  }
}

app.post("/save", (request, response) => {
  try {
    writePrototypeData(excelFilePath, "workbook", request.body, response);
  } catch (error) {
    console.error("Failed to save legacy workbook snapshot", error.message);
    response.status(500).send("Failed to save Excel content");
  }
});

app.get("/load", (_request, response) => {
  try {
    readPrototypeData(excelFilePath, "workbook", response);
  } catch (error) {
    console.error("Failed to load legacy workbook snapshot", error.message);
    response.status(500).send("Failed to load Excel content");
  }
});

app.post("/save-presentation", (request, response) => {
  try {
    writePrototypeData(powerPointFilePath, "presentation", request.body, response);
  } catch (error) {
    console.error("Failed to save legacy presentation snapshot", error.message);
    response.status(500).send("Failed to save PowerPoint content");
  }
});

app.get("/load-presentation", (_request, response) => {
  try {
    readPrototypeData(powerPointFilePath, "presentation", response);
  } catch (error) {
    console.error("Failed to load legacy presentation snapshot", error.message);
    response.status(500).send("Failed to load PowerPoint content");
  }
});

app.get("/status", (_request, response) => {
  response.json({
    excel: fs.existsSync(excelFilePath),
    powerpoint: fs.existsSync(powerPointFilePath),
    legacy: true,
    timestamp: new Date().toISOString(),
  });
});

app.use((error, _request, response, next) => {
  if (error.message === "Origin is not allowed by the legacy development server") {
    response.status(403).send("Origin is not allowed");
    return;
  }

  next(error);
});

async function start() {
  console.warn(
    "WARNING: legacy prototype only. No authentication, tenant isolation, durable storage, or production guarantees.",
  );
  const httpsOptions = readHttpsOptions();
  return https.createServer(httpsOptions, app).listen(port, "127.0.0.1", () => {
    console.info(`Legacy HTTPS server listening on https://localhost:${port}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error("Legacy server failed to start", error.message);
    process.exitCode = 1;
  });
}

module.exports = { app, start };
