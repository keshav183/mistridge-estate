import { useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { Empty, ErrorState, Skeleton, Spinner, useFetch, useToast } from '../ui';

const MAX_SIDE = 1600;

// Shrink in the browser before upload: a 6 MB phone photo becomes ~250 KB, which is what guests on slow networks download.
async function shrink(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not process that image.'))), 'image/jpeg', 0.82));
}

export default function Photos() {
  const toast = useToast();
  const rooms = useFetch((signal) => api('/admin/rooms', { signal }).then((d) => d.rooms), []);
  const [sel, setSel] = useState(null);
  const [alt, setAlt] = useState('');
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef(null);
  const room = rooms.data?.find((r) => r._id === sel) || rooms.data?.[0];

  const upload = async (files) => {
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    if (!list.length) return toast('Choose image files (JPEG, PNG or WebP).', 'error');
    setBusy(true);
    let done = 0;
    for (const f of list) {
      try {
        const blob = await shrink(f);
        const res = await fetch(`/api/admin/rooms/${room._id}/photos?alt=${encodeURIComponent(alt)}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new ApiError(res.status, data);
        done++;
      } catch (e) { toast(`${f.name}: ${e.message}`, 'error'); }
    }
    setBusy(false); setAlt('');
    if (input.current) input.current.value = '';
    if (done) { toast(`${done} photo${done > 1 ? 's' : ''} uploaded.`); rooms.reload(); }
  };

  const act = async (method, path, msg) => { try { await api(path, { method }); toast(msg); rooms.reload(); } catch (e) { toast(e.message, 'error'); } };

  return (
    <div className="stack" style={{ gap: '1.4rem' }}>
      <div><h1 style={{ fontSize: '2rem' }}>Room photos</h1><p className="muted small">The first photo is the cover shown on the website. Photos are resized in your browser before upload, so pages stay fast for guests.</p></div>
      {rooms.error ? <ErrorState error={rooms.error} onRetry={rooms.reload} /> : rooms.loading && !rooms.data ? <Skeleton h={240} r={8} /> : !room ? <Empty title="No rooms yet" /> : (
        <>
          <div className="tabs" role="tablist" aria-label="Room type">
            {rooms.data.map((r) => <button key={r._id} role="tab" className="tab" aria-selected={r._id === room._id} onClick={() => setSel(r._id)}>{r.name}<span className="n">{r.photos.length}</span></button>)}
          </div>

          <div className="photo-grid">
            {room.photos.map((p, i) => (
              <figure key={p.url} className="photo-tile">
                <img src={p.url} alt={p.alt} loading="lazy" />
                {i === 0 && <span className="badge badge-red cover-badge">Cover</span>}
                <figcaption>
                  <span className="small muted">{p.alt}</span>
                  <span className="tile-actions">
                    {i !== 0 && <button className="btn btn-quiet btn-sm" onClick={() => act('PATCH', `/admin/rooms/${room._id}/photos/${i}/cover`, 'Cover changed.')}>Make cover</button>}
                    <button className="btn btn-danger btn-sm" onClick={() => window.confirm('Delete this photo?') && act('DELETE', `/admin/rooms/${room._id}/photos/${i}`, 'Photo deleted.')}>Delete</button>
                  </span>
                </figcaption>
              </figure>
            ))}
            {!room.photos.length && <Empty title="No photos yet">The website shows a placeholder until you upload one.</Empty>}
          </div>

          <div className={`dropzone ${drag ? 'drag' : ''}`} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}>
            <p><strong>Add photos to {room.name}</strong></p>
            <p className="muted small">Drag images here, or choose files. JPEG, PNG or WebP, up to 8 per room.</p>
            <label className="field" style={{ maxWidth: 420, margin: '0 auto' }}><span className="field-label">Description for screen readers (optional)</span><input value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={120} placeholder="e.g. Bedroom with balcony view" /></label>
            <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => upload(e.target.files)} />
            <button className="btn" disabled={busy} onClick={() => input.current.click()}>{busy ? <><Spinner /> Uploading…</> : 'Choose photos'}</button>
          </div>
        </>
      )}
    </div>
  );
}
