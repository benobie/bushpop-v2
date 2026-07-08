"use server";

/**
 * BF-09 — favouriting a listing anywhere in the app (browse/search grids, PDP)
 * previously left `/account/favourites` showing stale data until a manual
 * reload, because Next's client Router Cache can serve a prefetched RSC
 * payload for that route from before the toggle. `revalidatePath` purges
 * that specific cached entry so the next navigation there re-fetches live.
 */
import { revalidatePath } from "next/cache";

export async function revalidateFavourites() {
  revalidatePath("/account/favourites");
}
