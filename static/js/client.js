var pcConfig = {
    'iceServers': [{
        'urls': 'stun:stun.l.google.com:19302'
    }]
};

const mediaConstraints = {
    audio: false,
    video: { width: 480, height: 360 },
};

var room = 'foo';
// Could prompt for room name:
// room = prompt('Enter room name:');
var showStatsBool = false;

var localVideo = document.querySelector('#localVideo');

let localStream;
let roomCreated = false;
let isInRoom = false;
let peerID;


var peerConnection;
var initiedConn = {};
// media functions

async function getLocalMedia(constraints){
    try{
        let stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStream = stream;
        localVideo.srcObject = stream;
    } catch(e) {console.log(e);}
}

// handle socket calls
var socket = io.connect();
socket.on('full', function(room) {
    alert('Room ' + room + ' is full');
});

socket.on("created", async function(room, id) {
    await getLocalMedia(mediaConstraints);
    roomCreated = true;
    peerID = id;

});

socket.on("join", async function(room, id){
    await getLocalMedia(mediaConstraints);
    peerID = id;
    socket.emit('start_connection', room)
});

socket.on("join_more", async function(peers, id){
    console.log("got join more");
    console.log(peers);
    await getLocalMedia(mediaConstraints);
    peerID = id;
    // peers.forEach(peer => async function(){
    for (i=0; i < peers.length; i+=1){
        peer = peers[i];
        console.log("trying to connect with: " + i);
        /* cretate connection, send offer to peer and receive answare to set remote description */
        initiedConn[peer.id_peer] = new RTCPeerConnection(pcConfig.iceServers);
        initiedConn[peer.id_peer].onaddstream = handleRemoteStreamAdded;
        initiedConn[peer.id_peer].onremovestream = handleRemoteStreamRemoved;
        initiedConn[peer.id_peer].onicecandidate = handleIceCandidate;

        initiedConn[peer.id_peer].addStream(localStream);

        // create and send conn offer
        sDescription = await initiedConn[peer.id_peer].createOffer();
        initiedConn[peer.id_peer].setLocalDescription(sDescription);

        // set remote description da peers

        // socket emit offer_more + peer.id_peer
        console.log("created conn for" + peer.id_peer);
        socket.emit("offer_more", room, peer.id_peer, peerID,sDescription);
    }
});

socket.on("offer_more", async function(id, remoteID, remoteDescription){
    console.log("offer_more pre filter " + id + " my id is: " + peerID);
       if (id === peerID){
           console.log(peerID + " got an offer!");
           newpeerconn = new RTCPeerConnection(pcConfig.iceServers);
           newpeerconn.onaddstream = handleRemoteStreamAdded;
           newpeerconn.onremovestream = handleRemoteStreamRemoved;
           newpeerconn.onicecandidate = handleIceCandidate;

           // setting the remote description (that init the call) from the param passed by the first peer
           newpeerconn.setRemoteDescription(new RTCSessionDescription(remoteDescription));

           newpeerconn.addStream(localStream);

           // create and send conn answer
           sDescription = await newpeerconn.createAnswer();
           newpeerconn.setLocalDescription(sDescription);

           socket.emit("answer_more", room, remoteID, id, sDescription);

       }

});
socket.on("answer_more", function(id, remoteID, description){
    if (id === peerID) {
        initiedConn[remoteID].setRemoteDescription(new RTCSessionDescription(description));
        socket.emit("finalize_more", peerID, room);
    }
});


socket.on("start_connection", async  function (room){
    if (roomCreated) {
        peerConnection = new RTCPeerConnection(pcConfig.iceServers);
        /*
        // https://webrtc.org/getting-started/remote-streams
        localStream.getTracks().forEach((track) => {peerConnection.addTrack(track, localStream)});

        peerConnection.addEventListener('track', async (event) => {
            const [remoteStream] = event.streams;
            remoteVideo.srcObject = remoteStream;
        });

        peerConnection.ontrack = function (event){
            remoteVideo.srcObject = event.streams[0];
            remoteStream = event.streams[0];
        };
        */
        peerConnection.onaddstream = handleRemoteStreamAdded;
        peerConnection.onremovestream = handleRemoteStreamRemoved;
        peerConnection.onicecandidate = handleIceCandidate;

        peerConnection.addStream(localStream);

        // create and send conn offer
        sDescription = await peerConnection.createOffer();
        peerConnection.setLocalDescription(sDescription);
        socket.emit("offer", {type: 'offer', sdp: sDescription, room: room}, {ROOM: room, ID: socket.id, STREAM: localStream});

    }
});
socket.on("offer", async function(description){
    console.log("received offer");
    if (!roomCreated && !isInRoom){
        peerConnection = new RTCPeerConnection(pcConfig.iceServers);

        /*
        // https://webrtc.org/getting-started/remote-streams
        localStream.getTracks().forEach((track) => {peerConnection.addTrack(track, localStream)});
        peerConnection.addEventListener('track', async (event) => {
            const [remoteStream] = event.streams;
            remoteVideo.srcObject = remoteStream;
        });
        peerConnection.ontrack = function (event){
            remoteVideo.srcObject = event.streams[0];
            remoteStream = event.streams[0];
        };
        */
        peerConnection.onaddstream = handleRemoteStreamAdded;
        peerConnection.onremovestream = handleRemoteStreamRemoved;
        peerConnection.onicecandidate = handleIceCandidate;

        // setting the remote description (that init the call) from the param passed by the first peer
        peerConnection.setRemoteDescription(new RTCSessionDescription(description));

        peerConnection.addStream(localStream);

        // create and send conn answer
        sDescription = await peerConnection.createAnswer();
        peerConnection.setLocalDescription(sDescription);
        console.log("emitted answer");
        socket.emit("answer", {type: 'answer', sdp: sDescription, room: room}, {ROOM: room, ID: socket.id, STREAM: localStream}, description);
}});


socket.on("answer", function(description){
    peerConnection.setRemoteDescription(new RTCSessionDescription(description));
    isInRoom = true;
});

socket.on('message', function (message){
    var candidate = new RTCIceCandidate({
        sdpMLineIndex: message.label,
        candidate: message.candidate
    });
    peerConnection.addIceCandidate(candidate);
});

socket.on('message_more', function (message, id){
    if (typeof initiedConn[id] !== "undefined") {
        var candidate = new RTCIceCandidate({
            sdpMLineIndex: message.label,
            candidate: message.candidate
        });
        initiedConn[id].addIceCandidate(candidate);
    }
});

// functions
function handleRemoteStreamRemoved(event) {
    console.log('Remote stream removed. Event: ', event);
}

function handleRemoteStreamAdded(event) {
    console.log('Remote stream added.');
    var video = document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsinline = true;
    video.srcObject = event.stream;
    document.getElementById('videos').appendChild(video);
}

function handleIceCandidate(event) {
    if (event.candidate) {
        socket.emit("message", {
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate
        }, room, peerID);
    }

    /*
    if (event.candidate) {
        socket.emit('message', {
            roomId,
            label: event.candidate.sdpMLineIndex,
            candidate: event.candidate.candidate,
        })
    }

 */
}

// start communication

socket.emit("create or join", room);

// conn stats

const statsDiv = document.querySelector('div#ConnStats');

function dumpStats(results) {
let statsString = '';
results.forEach(res => {
if (res.type == "outbound-rtp" || res.type == "transport" || res.type == "media-source") {
   statsString += '<h3>Report type=';
   statsString += res.type;
   statsString += '</h3>\n';
   statsString += `id ${res.id}<br>`;
   statsString += `time ${res.timestamp}<br>`;
   Object.keys(res).forEach(k => {
       if (k !== 'timestamp' && k !== 'type' && k !== 'id') {
           statsString += `${k}: ${res[k]}<br>`;
       }
   });
}
});
return statsString;
}

function showStats(results) {
const statsString = dumpStats(results);
statsDiv.innerHTML = `<h2>conn stats</h2>${statsString}`;
}


// Display statistics
if (showStatsBool) {
    setInterval(() => {
        if (peerConnection) {
            peerConnection.getStats(null)
                .then(showStats, err => console.log(err));
        } else {
            console.log('Not connected yet');
        }
    }, 1000);
}
