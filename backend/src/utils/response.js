export function sendData(res, data, meta) {
  const payload = meta ? { data, meta } : { data };
  res.status(200).json(payload);
}

export function sendCreated(res, data, meta) {
  const payload = meta ? { data, meta } : { data };
  res.status(201).json(payload);
}

export function sendNoContent(res) {
  res.status(204).end();
}
