import express, {Request, Response} from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();

import paymentRoute from './routes/PaymentRoutes';

const PORT = process.env.PORT;
console.log("port", PORT);

const app = express();
app.use(express.json())
app.use(cors());

app.get("/api/health", async (req: Request, res: Response) => {
  res.send({ message: "Health OK! from /api/health" });
});

app.use("/api/payment", paymentRoute);


app.listen(PORT, () => {
  console.log("Server running on localhost", PORT);
});