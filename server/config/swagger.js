const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",

    info: {
      title: "Hospital Coordination API",
      version: "1.0.0",
      description: "Hospital Coordination System Backend"
    },

    servers: [
      {
        url: "http://localhost:5000",
        description: "Development Server"
      }
    ]
  },

  apis: [
    "./docs/*.yaml"
  ]
};

module.exports = swaggerJsdoc(options);