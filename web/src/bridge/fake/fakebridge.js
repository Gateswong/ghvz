'use strict';

class FakeBridge {
  constructor(delegate, isRegistered, isAdmin, isJoined) {
    Utils.setDeterministicGenerator();
    this.delegate = delegate;

    this.localDb = new LocalDatabase({
      set: (...args) => this.delegate.set(...args),
      insert: (...args) => this.delegate.insert(...args),
      remove: (...args) => this.delegate.remove(...args),
      get: (...args) => this.delegate.get(...args),
    });

    this.databaseOperations = [];
    var fakeServer = new FakeServer({
      broadcastDatabaseOperation: (operation) => {
        this.databaseOperations.push(operation);
      },
    });
    var cloningFakeSerer = new CloningWrapper(fakeServer, SERVER_METHODS);
    var delayingCloningFakeServer = new DelayingWrapper(cloningFakeSerer, SERVER_METHODS, 100);
    this.server = delayingCloningFakeServer;

    setTimeout(() => this.performOperations_(), 37);

    window.fakeBridge = this;

    this.userId =
        populateFakeServer(fakeServer, isRegistered, isAdmin, isJoined);

    for (const funcName of SERVER_METHODS) {
      if (funcName != 'signIn') {
        this[funcName] = (...args) => this.server[funcName](...args);
      }
    }
  }
  signIn() {
    return new Promise((resolve, reject) => {
      if (!this.userId) {
        this.userId = Bridge.generateUserId();
        this.server.register(this.userId, {});
      }
      this.server.signIn(this.userId)
          .then((userId) => {
            resolve(userId);
          });
    });
  }
  attemptAutoSignIn() {
    return new Promise((resolve, reject) => {
      if (this.userId) {
        this.server.signIn(this.userId)
            .then((userId) => {
              resolve(userId);
            });
      } else {
        reject('Nope!');
      }
    });
  }
  listenToGame(gameId) {
    // Do nothing. This method is really just an optimization.
  }
  performOperations_() {
    for (let operation of this.databaseOperations) {
      let {type, path, value, index} = operation;
      switch (type) {
        case 'set': this.localDb.set(path, value); break;
        case 'insert': this.localDb.insert(path, index, value); break;
        case 'remove': this.localDb.remove(path); break;
        default: throwError('Unknown operation:', operation);
      }
    }
    this.databaseOperations = [];
    setTimeout(() => this.performOperations_(), 100);
  }
}

function CloningWrapper(inner, funcNames) {
  for (const funcName of funcNames) {
    this[funcName] = function(...args) {
      // console.log('Calling', funcName, 'with args', ...args);
      return Utils.copyOf(inner[funcName](...args.map(Utils.copyOf)));
    }
  }
}

function DelayingWrapper(inner, funcNames, delay) {
  delay = delay || 100;
  for (const funcName of funcNames) {
    this[funcName] = function(...args) {
      // console.log('Making request', funcName, ...args);
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            // console.log('Recipient received request', funcName, ...args);
            const result = inner[funcName](...args);
            // console.log('Recipient responding with', result);
            setTimeout(() => resolve(result), delay);
          } catch (error) {
            console.error(error);
            setTimeout(() => reject(error), delay);
          }
        }, delay);
      });
    };
  }
}
