import express from "express";
import cors from "cors";
import listingsRouter from "./routes/listings.js";

const app = express();
app.use(cors({
    origin: [
        "http://localhost:5173",
        "https://flogit.com.au"
    ],
    credentials: true
}));

app.use("/listings", listingsRouter);

app.get("/", (req, res) => res.send("Marketplace API running"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`Server running on ${PORT}`));
