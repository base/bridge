export async function fileFromPath(path: string, mustExist: boolean = true) {
  const file = Bun.file(path);
  if (mustExist && !(await file.exists())) {
    throw new Error(`File not found: ${file.name}`);
  }
  return file;
}
