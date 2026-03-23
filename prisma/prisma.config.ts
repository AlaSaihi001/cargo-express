// prisma.config.ts

const { DATABASE_URL } = process.env;

module.exports = {
  datasources: {
    db: {
      url: DATABASE_URL,
      provider: 'mysql',
    },
  },
};