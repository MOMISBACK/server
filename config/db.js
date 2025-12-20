const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const uri =
      process.env.NODE_ENV === 'test'
        ? process.env.MONGO_URI_TEST
        : process.env.MONGO_URI;

    if (!uri) {
      throw new Error('MongoDB URI not defined for this environment');
    }

    const conn = await mongoose.connect(uri);

    console.log(`MongoDB Connected (${process.env.NODE_ENV}): ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
