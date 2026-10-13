import { videos } from "@/lib/videos";

export default function LibraryPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Library</h1>
      <ul className="grid gap-4 sm:grid-cols-3">
        {videos.map((video) => (
          <li key={video.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="font-medium">{video.title}</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, "0")}
            </p>
            <p className="mt-2 text-xs text-zinc-500">{video.credit}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
