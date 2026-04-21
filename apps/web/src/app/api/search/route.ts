export async function GET(req: Request) {
  return import("../geocode/route").then((module) => module.GET(req));
}
