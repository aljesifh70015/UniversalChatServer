const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" }
});

io.on("connection", (socket) => {

    socket.on("send_message", (data) => {
        socket.broadcast.emit("receive_message", data);
    });

    socket.on("delete_message", (messageId) => {
        io.emit("delete_message", messageId);
    });
});

app.get("/", (req,res)=>{
    res.send("Universal Chat Server Running");
});

server.listen(process.env.PORT || 3000);
