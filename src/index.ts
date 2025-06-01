import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
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
import { addOrganisationId } from './utils/migration';
import {embedRouter3} from './routes/v3/embed';
dotenv.config();

const app: Application = express();
const PORT: number = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Test route
app.get('/', (req: Request, res: Response) => {
    res.send('Health Check: Server is running');
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

async function main(){
    try {
        await mongoose.connect(process.env.MONGODB_URI!);
        console.log("Connected to MongoDB");
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
       // addOrganisationId(process.env.MONGODB_URI!);
    } catch (error) {
        console.error("Error connecting to MongoDB", error);
    }

}
main();

export default app;
