import { lerConfig } from './config.js';
import { construirApp } from './app.js';

const config = lerConfig();
const app = await construirApp(config);

try {
  await app.listen({ host: config.host, port: config.porta });
  console.log(`HRZZ servidor em http://${config.host}:${config.porta}`);
} catch (erro) {
  console.error('nao consegui subir o servidor:', (erro as Error).message);
  process.exit(1);
}

const sair = () => {
  void app.close().finally(() => process.exit(0));
};
process.on('SIGINT', sair);
process.on('SIGTERM', sair);
