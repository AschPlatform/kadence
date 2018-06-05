'use strict';

const levelup = require('levelup');
const leveldown = require('leveldown');
const encoding = require('encoding-down');


/**
 * Storage for kademlia data
 */
class KademliaLevelStorage {

  constructor( dir ) {
    this.level = levelup(encoding(leveldown(dir)));
    ['get', 'put', 'del', 'createReadStream'].forEach( funName => {
      this[funName] = this.level[funName]
    }); 
  }

}

module.exports = KademliaLevelStorage;
