import { ApiError, bucket, errorResponse } from "@/lib/marketplace";

export async function GET(request: Request) {
  try {
    const key=new URL(request.url).searchParams.get("key")||"";
    if(!/^products\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(key)) throw new ApiError(400,"invalid_photo_key");
    const object=await bucket().get(key);
    if(!object) throw new ApiError(404,"photo_not_found");
    return new Response(object.body,{headers:{"Content-Type":object.httpMetadata?.contentType||"application/octet-stream","Cache-Control":"public, max-age=86400","X-Content-Type-Options":"nosniff"}});
  } catch(error) { return errorResponse(error); }
}
