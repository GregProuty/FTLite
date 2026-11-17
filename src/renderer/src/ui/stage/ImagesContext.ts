import { createContext, useContext } from 'react';
import type { UiImages } from '../images';
export const ImagesContext = createContext<UiImages>(new Map());
export function useImages(): UiImages { return useContext(ImagesContext); }
