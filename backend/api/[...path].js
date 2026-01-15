import app from '../server.js';

export const config = {
  api: {
    bodyParser: false
  }
};

export default function handler(req, res) {
  return app(req, res);
}
