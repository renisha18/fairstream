import { notFound } from "next/navigation";
import { getVideo, videos } from "@/lib/videos";
import { Player } from "./player";

export function generateStaticParams() {
  return videos.map((video) => ({ id: video.id }));
}

export default async function WatchPage({ params }: PageProps<"/watch/[id]">) {
  const { id } = await params;
  const video = getVideo(id);
  if (!video) notFound();
  return <Player video={video} />;
}
