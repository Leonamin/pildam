// pnpm add-user <username>   (비밀번호는 프롬프트, 또는 PILDAM_PASSWORD 환경변수)
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { upsertUser } from "../auth.ts";
import { dataDir } from "../store.ts";

const username = process.argv[2];
if (!username) {
  console.error("사용법: pnpm add-user <username>");
  process.exit(1);
}

let password = process.env.PILDAM_PASSWORD;
if (!password) {
  // 입력한 글자가 화면에 보이지 않도록 출력을 버린다.
  const rl = createInterface({ input: process.stdin, output: new Writable({ write: (_c, _e, cb) => cb() }), terminal: true });
  process.stdout.write("비밀번호: ");
  password = await rl.question("");
  rl.close();
  process.stdout.write("\n");
}
if (password.length < 8) {
  console.error("비밀번호는 8자 이상이어야 해요.");
  process.exit(1);
}
await upsertUser(username, password);
console.log(`${username} 저장됨 (${dataDir}/users.json)`);
