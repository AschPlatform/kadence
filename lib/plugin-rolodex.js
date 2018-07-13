/**
 * @module kadence/rolodex
 */

'use strict';

const utils = require('./utils');
const LRUCache = require('lru-cache');
const Database = require('nedb')


/**
 * Keeps track of seen contacts in a compact file so they can be used as
 * bootstrap nodes
 */
class RolodexPlugin {

  static get EXTERNAL_PREFIX() {
    return 'external';
  }

  static get INTERNAL_PREFIX() {
    return 'internal';
  }

  /**
   * @constructor
   * @param {KademliaNode} node
   * @param {string} peerCacheFilePath - Path to file to use for storing peers
   */
  constructor(node, peerCacheFilePath) {
    this.node = node;
    this.contractUpdateCache = new LRUCache(1000);

    this.db = new Database({ filename: peerCacheFilePath, timestampData: true, autoload: true });
    this.db.persistence.setAutocompactionInterval(3600 * 1000);
    const errorHandler = (err) => this.node.logger.info('rolodex index error', err)
    this.db.ensureIndex({ fieldName: 'updatedAt' }, errorHandler)
    this.db.ensureIndex({ fieldName: 'external' }, errorHandler)
    this.db.ensureIndex({ fieldName: 'indentity' }, errorHandler)

    this.node.router.events.on('add', identity => {
      const now = Date.now();
      const lastUpdateTime = this.contractUpdateCache.get(identity);
      if (lastUpdateTime + 60 * 1000 > now) {
        return;
      }
      this.contractUpdateCache.set(identity, now);
      this.node.logger.debug(`updating peer profile ${identity}`);
      const contact = this.node.router.getContactByNodeId(identity);
      this.setExternalPeerInfo(identity, contact);
    });
  }

  /**
   * Returns a list of bootstrap nodes from local profiles
   * @returns {string[]} urls
   */
  getBootstrapCandidates() {
    return new Promise((resolve, reject) => {
      this.db.find({ external: 1 }).sort({ updatedAt: -1, }).limit(25).exec(function (err, contacts) {
        if (err) {
          reject(err)
        } else if (!contacts) {
          resolve([])
        } else {
          const result = contacts.map(c => {
            return utils.getContactURL([
              c.identity,
              {
                hostname: c.hostname,
                port: c.port,
                protocol: c.protocol
              }
            ])
          })
          resolve(result)
        }
      })
    });
  }

  /**
   * Returns the external peer data for the given identity
   * @param {string} identity - Identity key for the peer
   * @returns {object}
   */
  getExternalPeerInfo(identity) {
    return this._getContract({ identity, external: 1 })
  }

  /**
   * Returns the internal peer data for the given identity
   * @param {string} identity - Identity key for the peer
   * @returns {object}
   */
  getInternalPeerInfo(identity) {
    return this._getContract({ identity, external: 0 })
  }

  /**
   * Returns the external peer data for the given identity
   * @param {string} identity - Identity key for the peer
   * @param {object} data - Peer's external contact information
   * @returns {object}
   */
  setExternalPeerInfo(identity, data) {
    return this._updateContact({
      identity: identity,
      hostname: data.hostname,
      port: data.port,
      protocol: data.protocol,
      external: 1
    })
  }

  /**
   * Returns the internal peer data for the given identity
   * @param {string} identity - Identity key for the peer
   * @param {object} data - Our own internal peer information
   * @returns {object}
   */
  setInternalPeerInfo(identity, data) {
    return this._updateContact({
      identity: identity,
      hostname: data.hostname,
      port: data.port,
      protocol: data.protocol,
      external: 0
    })
  }

  _updateContact(contact) {
    return new Promise((resolve, reject) => {
      this.db.update({identity: contact.identity}, contact, { upsert: true }, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  _getContact(query) {
    return new Promise((resolve, reject) => {
      this.db.findOne(query, function (err, contact) {
        if (err) {
          reject(err)
        } else {
          resolve(contact)
        }
      })
    })
  }
}

/**
 * Registers a {@link module:kadence/rolodex~RolodexPlugin} with a
 * {@link KademliaNode}
 * @param {string} peerCacheFilePath - Path to file to use for storing peers
 */
module.exports = function (peerCacheFilePath) {
  return function (node) {
    return new RolodexPlugin(node, peerCacheFilePath);
  }
};

module.exports.RolodexPlugin = RolodexPlugin;
