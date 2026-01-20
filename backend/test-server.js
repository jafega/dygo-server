import express from 'express';
const app = express();
const PORT = 3005;

app.get('/', (req, res) => {
  res.send('Test OK');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Test server running on port ${PORT}`);
});
