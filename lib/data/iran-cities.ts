import ostanData from "iran-cities-json/ostan.json";

type Ostan = { id: number; name: string };

export const IRAN_PROVINCES: string[] = (ostanData as Ostan[])
  .map((province) => province.name)
  .sort((a, b) => a.localeCompare(b, "fa"));
