import { getChatGPTUser } from "@/app/chatgpt-auth";
import { ApiError, bucket, errorResponse, json, requireOwner } from "@/lib/marketplace";

export async function POST(request: Request) {
  try {
    requireOwner(await getChatGPTUser());
    const data=await request.formData(), file=data.get("file");
    if (!(file instanceof File) || file.size<1 || file.size>5_000_000 || !["image/jpeg","image/png","image/webp"].includes(file.type)) throw new ApiError(400,"invalid_photo");
    const key=`products/${crypto.randomUUID()}.${file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1]}`;
    await bucket().put(key,await file.arrayBuffer(),{httpMetadata:{contentType:file.type}});
    return json({url:`/api/photos?key=${encodeURIComponent(key)}`},201);
  } catch(error) { return errorResponse(error); }
}
