import webpack from 'webpack';
import webpackMiddleware from 'webpack-dev-middleware';
import config from './webpack.config.babel.js';
import request from 'request';
import bodyParser from 'body-parser';
import fs from 'fs';
import multer from 'multer';
var compiler = webpack(config);

import express from 'express';
import http from 'http';
import socketio from 'socket.io';

var port = 8080;
if (process.argv[2]) {
  port = parseInt(process.argv[2]);
}

var peers = [];
var clients = {};

var app = express();
var token = 'YsXUX8HJw0RXM5JkwWEfrT9yJCa6sh';
var tags = {};
var knowntags = new Set();
var uploading = multer({
  dest: __dirname + '/uploads/',
});

app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}));

var server = http.Server(app);
var io = socketio(server);

app.use(require("webpack-dev-middleware")(compiler, {
    noInfo: true, publicPath: config.output.publicPath
}));
app.use(require("webpack-hot-middleware")(compiler));
app.use(express.static('build'));

app.post('/tag', uploading.single('displayImage'),(req, res) => {

  var newPath = req.file.path;
  fs.readFile(newPath, (err, original_data) => {
    var base64Image = original_data.toString('base64');
    request.post('https://api.clarifai.com/v1/token/', {'form': {'client_id': "pRH0rURL4ygLoq2egGvpqO9-f2DrCfAoum2QQJoi", 'client_secret': "X5pu0BEBKaVLTD_I9U4n1KAyu3rFVHRwk1H_rrFh", 'grant_type': "client_credentials"}}, (err, httpResponse, bodystring) => {
      var body = JSON.parse(bodystring);
        token = body.access_token;
        request.post('https://api.clarifai.com/v1/tag/', {'form':{'encoded_data': base64Image}, 'headers': {'Authorization': 'Bearer '+token}}, (err,httpResponse,bodystring) => {
          var body = JSON.parse(bodystring);
          if (body.status_code == 'OK') {
            var newtags = body.results[0].result.tag.classes;
            for (var tag of newtags) {
              if (tags[tag] !== undefined) {
                tags[tag].push(newPath);
              }
              else {
                tags[tag] = [newPath];
              }
              knowntags.add(tag);
            }
            for (var peer of peers) {
              request.post(peer + '/imageTagged', {'form': {'tags': newtags}});
            }
          }
          console.log(tags);
        });
     });

    res.status(200).send("OK");
  });
});

app.post('/imageTagged', (req, res) => {
  var body = req.body;
  for (var tag of body.tags) {
    knowntags.add(tag);
  }
  for (let id of Object.keys(clients)) {
    clients[id].emit('new tags', {tags: [...knowntags]});
  }
  res.end();
});

app.post('/addPeer', (req, res) => {
  console.log('adding peer', req.body.url);
  var peer_url = 'http://' + req.body.url;
  peers.push(peer_url);
  res.status(200).send({status: 'OK'});
  request.post(peer_url + '/peerAdded');
});

app.post('/peerAdded', (req, res) => {
  var peer_url = req.protocol + '://' + req.get('host');
  peers.push(peer_url);
  res.status(200).send({status: 'OK'});
});

app.post('/requestImage', (req, res) => {
  console.log('I have sent the image request', req.body);
  var reqbody = req.body;
  var peer_url = req.protocol + '://' + req.get('host');
  var tag = reqbody.tag;
  var client_id = reqbody.socket_id;
  for (var peer of peers) {
    request.post(peer + '/imageRequested', {'form': {'tag': tag, 'propnum': 2, 'client_id' : client_id, 'requester': peer_url}});
  }
  res.status(200).send({status: 'OK'});
});

app.post('/imageRequested', (req,res) => {
  var reqbody = req.body;
  var requester = reqbody.requester;
  var client_id = reqbody.socket_id;
  if (tags[reqbody.tag]) {
    var rand = Math.random() * (tags[reqbody.tag].length - 1);
    var pic = tags[reqbody.tag][rand];
    console.log(pic);
    fs.readFile(pic,(err, original_data) => {
      request.post(requester + '/imageFound', {'form': {'image': true, 'buffer': original_data.toString('base64'), 'client_id' : client_id}});
    });
  }
  else {
    if (reqbody.propnum > 0) {
      console.log('propnum', reqbody.propnum);
      for (var peer of peers) {
        var newpropnum = reqbody.propnum - 1;
        request.post(peer + '/imageRequested', {'form': {'tag': reqbody.tag, 'propnum': newpropnum, 'client_id' : client_id, 'requester': requester}});
      }
    }
  }
});

app.post('/imageFound', (req,res) => {
  console.log('I just got an image found posting');
  var reqbody = JSON.parse(req.body);
  var image = reqbody.image;
  var client_id = reqbody.socket_id;
  var socket = clients[client_id];
  socket.emit('imageFound' , {'image': image});
});

app.post('/test', (req, res) => {
  socket.emit('test', {test: 'test'});
  res.end();
});

io.on('connection', (socket) => {
  clients[socket.id] = socket;
  socket.emit("connected", {socketId: socket.id, tags: [...knowntags]});
  socket.on('disconnect', () => {
    console.log('frontend disconnected');
  });
  console.log(socket.id, "connected");
});

server.listen(port, () => {
  console.log('listening on port', port);
});
