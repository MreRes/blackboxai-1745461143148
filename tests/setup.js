const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;

// Connect to the in-memory database before running tests
module.exports = async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    const mongooseOpts = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    };

    await mongoose.connect(uri, mongooseOpts);

    // Create admin token for protected routes
    global.adminToken = 'admin-test-token';
};

// Remove and close the database and server after tests
module.exports.teardown = async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongod.stop();
};

// Clear all test data after each test
module.exports.clearDatabase = async () => {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany();
    }
};
