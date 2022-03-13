'use strict';
var express = require("express");
// var os = require('os');
// var nodeStatic = require('node-static');
var https = require('https');
var socketIO = require('socket.io');
var fs = require("fs");
var connections = [];
var peers = [];
var peer_counter = 0;
// var fileServer = new(nodeStatic.Server)();

var httpApp = express();
httpApp.use(express.static(__dirname + "/static/"));

var app = https.createServer({
    key:  fs.readFileSync(__dirname + "/certs/localhost.key"),
    cert: fs.readFileSync(__dirname + "/certs/localhost.crt")
}, httpApp).listen('8443', () => console.log(`listening on port 8443`));


var io = socketIO.listen(app);
io.sockets.on('connection', function(socket) {
    socket.on('create or join', function(room) {
        console.log("[+] got create or join");
        var clientsInRoom = io.sockets.adapter.rooms[room];
        var numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
        // console.log("NUMBERS OF CLIENTS: " + numClients);
        if (numClients === 0) {
            socket.join(room);
            console.log("[+] emitted created");
            peers.push({id_peer: peer_counter, room: room});
            peer_counter += 1;
            socket.emit('created', room, peer_counter-1);

        } else if (numClients === 1) {
            socket.join(room);
            console.log("[+] emitted join");
            peers.push({id_peer: peer_counter, room: room});
            peer_counter += 1;
            socket.emit('join', room, peer_counter-1);
        } else { // max two clients
            console.log("[+] more than 2 peers ");
            socket.join(room);
            // peers.push({id_peer: peer_counter, room: room});
            peer_counter += 1;
            console.log("[+] emitted join more");
            socket.emit("join_more", peers, peer_counter-1);
            peers.push({id_peer: peer_counter-1, room: room});
        }
    });
    socket.on("start_connection", function (room){
        console.log("[+] emitted start call broadcast");
        socket.broadcast.to(room).emit('start_connection', room)
    });

    socket.on('message', function(message, room, id) {
        console.log("[+] emitted message broadcast");
        var clientsInRoom = io.sockets.adapter.rooms[room];
        var numClients = clientsInRoom ? Object.keys(clientsInRoom.sockets).length : 0;
        console.log(numClients);
        if (numClients < 3) {
            socket.broadcast.to(room).emit('message', message);
        }
        else {
            socket.broadcast.to(room).emit('message_more', message, id);
        }
    });
    socket.on("offer", function (message){
       let room = message.room;
       let sdp = message.sdp;
        console.log("[+] emitted offer broadcast");
       socket.broadcast.to(room).emit("offer", sdp);
    });
    socket.on("answer", function (message, called_sdp){
        let room = message.room;
        let sdp = message.sdp;
        connections.push({calling_sdp: sdp, called_sdp: called_sdp});
        console.log("[+] emitted answer broadcast");
        socket.broadcast.to(room).emit("answer", sdp);
    });
    socket.on("offer_more", function (room, id, thirdID,description){
        console.log("[+] emitted offer more broadcast");
        socket.broadcast.to(room).emit("offer_more", id, thirdID, description);
    });
    socket.on("answer_more", function (room, thirdID, destID, description){
        console.log("[+] emitted answer more broadcast");
        socket.broadcast.to(room).emit("answer_more", thirdID, destID, description);
    });
    socket.on("finalize_more", function(id, room){
        console.log("[+] finalized ");
    });
    socket.on('bye', function(){
        console.log('received bye');
    });
});