import React, { Component } from 'react';
import './App.css';
import Navbar from './Navbar/Navbar.jsx';
import TagList from './TagList/TagList.jsx';
import io from 'socket.io-client';

export default class App extends Component {
  constructor(props) {
    super(props);

    let socket = io('http://localhost:8080', {'force new connection': true});
    this.state = {socket: socket, socket_id: '', tags: []};
    this.state.socket.on('connected', (data) => {
      this.setState(data);
    });
    this.state.socket.on('new tags', (data) => {
      this.setState(data);
    });
  }

  render() {
    return (
      <div>
        <Navbar socket={this.state.socket} socketId={this.state.socket_id} tags={this.state.tags}/>
        <TagList tags={this.state.tags}/>
      </div>
    );
  }
}
