export type Video = {
  id: string;
  title: string;
  src: string;
  thumbnail: string;
  /** Length in seconds. */
  duration: number;
  credit: string;
};

const CREDIT = "© Blender Foundation, CC BY";

export const videos: Video[] = [
  {
    id: "big-buck-bunny",
    title: "Big Buck Bunny",
    src: "/videos/big-buck-bunny.mp4",
    thumbnail: "/videos/big-buck-bunny.jpg",
    duration: 90,
    credit: CREDIT,
  },
  {
    id: "sintel",
    title: "Sintel",
    src: "/videos/sintel.mp4",
    thumbnail: "/videos/sintel.jpg",
    duration: 90,
    credit: CREDIT,
  },
  {
    id: "tears-of-steel",
    title: "Tears of Steel",
    src: "/videos/tears-of-steel.mp4",
    thumbnail: "/videos/tears-of-steel.jpg",
    duration: 90,
    credit: CREDIT,
  },
];

export function getVideo(id: string): Video | undefined {
  return videos.find((v) => v.id === id);
}
