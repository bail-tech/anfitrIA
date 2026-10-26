import { CharacterShowcase } from '@/components/character/showcase';

export const metadata = { title: 'Anfi' };

/** Public page: the character in each mood (no data). Also the visual check for the 3D scene. */
export default function AnfiPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">Anfi</h1>
      <p className="mt-1 text-sm text-muted">El conserje de AnfitrIA · cada estado de la cara sigue al asistente.</p>
      <CharacterShowcase />
    </main>
  );
}
