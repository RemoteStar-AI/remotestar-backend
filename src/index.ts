import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import compression from 'compression';
// Import routers (Ensure these are properly typed)
import {extractRouter} from './routes/v1/extract';
import {embedRouter} from './routes/v1/embed';
import {searchRouter} from './routes/v1/search';
import { getUserRouter } from './routes/v1/getuser';
import { userRouter } from './routes/v1/user';
import { companyRouter } from './routes/v1/company';
import { jobRouter } from './routes/v1/job';
import { embedRouter as embedRouterV2 } from './routes/v2/embed';
import { jobRouter as jobRouterV2 } from './routes/v2/job';
import { matchingRouter as searchRouterV2 } from './routes/v2/search';
import { userRouter as userRouterV2 } from './routes/v2/user';
import { analyseRouter } from './routes/v2/analyse';
import { bookmarksRouter } from './routes/v2/bookmarks';
import { organisationRouter } from './routes/v2/organisation';
import {resumeUploadRouter as embedRouter3} from './routes/v3/embed';
import { resumeUploadRouter as embedRouter4 } from './routes/v4/embed';
import { jobRouter as jobRouter4 } from './routes/v4/job';
import { resumeUploadRouter as embedRouter5 } from './routes/v5/embed';
import { resumeUploadRouter as embedRouter6 } from './routes/v6/embed';
import { jobRouter as jobRouter6 } from './routes/v6/job';
import { searchRouter as searchRouter6 } from './routes/v6/search';
import { userRouter as userRouter6 } from './routes/v6/user';
import { callRouter } from './routes/v6/call';
import { interviewRouter } from './routes/v6/interview';

dotenv.config();

const app: Application = express();
const PORT: number = Number(process.env.PORT) || 3000;

// WebSocket setup
const server = http.createServer(app);
// Tune HTTP server for better throughput and lower latency
server.keepAliveTimeout = 61_000; // keep connections alive a bit beyond typical LB timeouts
server.headersTimeout = 65_000;   // must be larger than keepAliveTimeout
const wss = new WebSocketServer({ server });

// Store connected clients
type ClientId = string;
const clients = new Map<ClientId, WebSocket>();

// Message interfaces
interface InitMessage {
  type: "init";
  payload: {
    candidateId: string;
  };
}

interface CallEventMessage {
  event: string;
  callId: string;
  status: string;
  data?: any;
}

// WebSocket connection handler
wss.on("connection", (ws: WebSocket) => {
  let candidateId: string | undefined;

  ws.on("message", (msg: Buffer) => {
    try {
      const message = msg.toString();
      const parsed: InitMessage = JSON.parse(message);
      
      if (parsed.type === "init") {
        candidateId = parsed.payload.candidateId;
        console.log("candidateId: ", candidateId);
        clients.set(candidateId, ws);
        console.log(`WebSocket client connected: ${candidateId}`);
        
        // Send confirmation
        ws.send(JSON.stringify({
          type: "connected",
          candidateId: candidateId,
          message: "Successfully connected to WebSocket server"
        }));
      }
    } catch (err) {
      console.error("Invalid WebSocket message received:", err);
      ws.send(JSON.stringify({
        type: "error",
        message: "Invalid message format"
      }));
    }
  });

  ws.on("close", () => {
    if (candidateId) {
      clients.delete(candidateId);
      console.log(`WebSocket client disconnected: ${candidateId}`);
    }
  });

  ws.on("error", (error: any) => {
    console.error("WebSocket error:", error);
    if (candidateId) {
      clients.delete(candidateId);
    }
  });
});

// Export WebSocket utilities for use in routes
export const sendWebSocketMessage = (candidateId: string, message: CallEventMessage) => {
  const ws = clients.get(candidateId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
    console.log(`Sent WebSocket message to ${candidateId}:`, message);
    return true;
  } else {
    console.log(`No active WebSocket connection for ${candidateId}`);
    return false;
  }
};

export const broadcastToAll = (message: CallEventMessage) => {
  let sentCount = 0;
  clients.forEach((ws, candidateId) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      sentCount++;
    }
  });
  console.log(`Broadcasted message to ${sentCount} clients`);
  return sentCount;
};

// Lightweight compression for API JSON; level 6 balances CPU and size well
app.use(compression({ level: 6 }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cors());

// Test route
app.get('/', (req: Request, res: Response) => {
    res.send('Health Check: Server is running on db: ' + process.env.MONGODB_URI!.split('/').pop());
});
app.get('/health', (req: Request, res: Response) => {
    res.send('Health Check: Server is running on db: ' + process.env.MONGODB_URI!.split('/').pop());
});
app.get('/health-check', async (req: Request, res: Response) => {
    res.send('Health Check: Server is running on db: ' + process.env.MONGODB_URI!.split('/').pop());
});

//v1 routes 
app.use("/api/v1/extract", extractRouter);
app.use("/api/v1/embed", embedRouter);
app.use("/api/v1/search", searchRouter);
app.use("/api/v1/getuser",getUserRouter)
app.use("/api/v1/user", userRouter);
app.use("/api/v1/company", companyRouter);
app.use("/api/v1/job", jobRouter);

//v2 routes
app.use("/api/v2/embed", embedRouterV2);
app.use("/api/v2/job", jobRouterV2);
app.use("/api/v2/search", searchRouterV2);
app.use("/api/v2/user", userRouterV2);
app.use("/api/v2/analyse", analyseRouter);
app.use("/api/v2/bookmarks", bookmarksRouter);
app.use("/api/v2/organisation", organisationRouter);

//v3 routes
app.use("/api/v3/embed", embedRouter3);

//v4 routes
app.use("/api/v4/embed", embedRouter4);
app.use("/api/v4/job", jobRouter4);

//v5 routes
app.use("/api/v5/embed", embedRouter5);

//v6 routes
app.use("/api/v6/embed", embedRouter6);
app.use("/api/v6/job", jobRouter6);
app.use("/api/v6/search", searchRouter6);
app.use("/api/v6/user", userRouter6);
app.use("/api/v6/call", callRouter);
app.use("/api/v6/interview", interviewRouter);

async function main(){
    try {
        await mongoose.connect(process.env.MONGODB_URI!, {
            maxPoolSize: 50,
            minPoolSize: 5,
            serverSelectionTimeoutMS: 5_000,
            socketTimeoutMS: 45_000,
            retryWrites: true,
        } as any);
        console.log("Connected to MongoDB with database name: " + process.env.MONGODB_URI!.split('/').pop());
        
        server.listen(PORT,'0.0.0.0', () => {
            console.log(`Server is running on port ${PORT}`);
            console.log(`WebSocket server is ready for connections : hehe testing`);
        });

    } catch (error) {
        console.error("Error connecting to MongoDB", error);
    }

}
main();

export default app;
