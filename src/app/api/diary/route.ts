import { handle, readJson } from "@/lib/http/handle";
import { addDiaryEntry, listDiary, type DiaryInput } from "@/lib/services/diary";
import { currentUser } from "@/lib/services/users";

export async function GET() {
  return handle(async () => Response.json({ entries: await listDiary((await currentUser()).id, 60) }));
}

export async function POST(req: Request) {
  return handle(async () => {
    const entry = await addDiaryEntry((await currentUser()).id, await readJson<DiaryInput>(req));
    return Response.json({ entry }, { status: 201 });
  });
}
