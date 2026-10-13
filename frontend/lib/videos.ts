export type Video = {
  id: string;
  title: string;
  src: string;
  thumbnail: string;
  /** Length in seconds. */
  duration: number;
  credit: string;
  description: string;
  tags: string[];
  category: Category;
};

export type Category = "Animation" | "Sci-fi";
export const categories: Category[] = ["Animation", "Sci-fi"];

const CREDIT = "© Blender Foundation, CC BY";

export const videos: Video[] = [
  {
    id: "big-buck-bunny",
    title: "Big Buck Bunny",
    src: "/videos/big-buck-bunny.mp4",
    thumbnail: "/videos/big-buck-bunny.jpg",
    duration: 90,
    credit: CREDIT,
    description: "A gentle giant rabbit's peaceful day in the meadow is ruined by three mischievous rodents, so he plans a comeback.",
    tags: ["Animation", "Comedy"],
    category: "Animation",
  },
  {
    id: "sintel",
    title: "Sintel",
    src: "/videos/sintel.mp4",
    thumbnail: "/videos/sintel.jpg",
    duration: 90,
    credit: CREDIT,
    description: "A lone girl crosses a frozen world in search of the baby dragon she once rescued.",
    tags: ["Animation", "Fantasy"],
    category: "Animation",
  },
  {
    id: "tears-of-steel",
    title: "Tears of Steel",
    src: "/videos/tears-of-steel.mp4",
    thumbnail: "/videos/tears-of-steel.jpg",
    duration: 90,
    credit: CREDIT,
    description: "In a future Amsterdam, a group of scientists tries to save the world from rogue robots, and an old heartbreak.",
    tags: ["Sci-fi", "Live action"],
    category: "Sci-fi",
  },
];

export function getVideo(id: string): Video | undefined {
  return videos.find((v) => v.id === id);
}
