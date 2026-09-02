import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Send, Trash2 } from 'lucide-react';
import { Button } from './ui/Button';
import { supabase } from '../lib/supabase';

type Note = { id: string; note: string; created_at: string };

interface ServiceOrderNotesProps {
    serviceOrderId: string;
    tenantId: string;
}

// Append-only log of technician updates, separate from the single
// "Observação do Técnico" field — that one stays as the initial diagnosis
// note; this is for "chegou a peça", "iniciado o reparo" etc. added over
// time without overwriting anything. Each entry saves immediately (its own
// insert), same pattern as a status change, not tied to the OS form's Salvar.
export function ServiceOrderNotes({ serviceOrderId, tenantId }: ServiceOrderNotesProps) {
    const [notes, setNotes] = useState<Note[]>([]);
    const [newNote, setNewNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        fetchNotes();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [serviceOrderId]);

    const fetchNotes = async () => {
        const { data, error } = await supabase
            .from('service_order_notes')
            .select('id, note, created_at')
            .eq('service_order_id', serviceOrderId)
            .order('created_at', { ascending: false });
        if (!error) setNotes(data || []);
    };

    const deleteNote = async (n: Note) => {
        if (!confirm(`Remover esta atualização de ${new Date(n.created_at).toLocaleString('pt-BR')}? Some do link público também.`)) return;
        const { error } = await supabase.from('service_order_notes').delete().eq('id', n.id);
        if (error) {
            toast.error('Erro ao remover atualização: ' + error.message);
            return;
        }
        toast.success('Atualização removida.');
        fetchNotes();
    };

    const addNote = async () => {
        if (!newNote.trim()) return;
        setIsSubmitting(true);
        try {
            const { error } = await supabase.from('service_order_notes').insert([{
                service_order_id: serviceOrderId,
                user_id: tenantId,
                note: newNote.trim(),
            }]);
            if (error) throw error;
            setNewNote('');
            toast.success('Atualização adicionada!');
            fetchNotes();
        } catch (error: any) {
            toast.error('Erro ao adicionar atualização: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div>
            <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Ex: Peça chegou, reparo agendado pra amanhã."
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-green/50 bg-white min-h-[70px] text-sm sm:text-base mb-3"
            />
            <div className="flex justify-end mb-4">
                <Button type="button" size="sm" onClick={addNote} disabled={isSubmitting || !newNote.trim()}>
                    <Send className="w-4 h-4 mr-2" /> Adicionar Atualização
                </Button>
            </div>

            {notes.length > 0 && (
                <div className="space-y-3 border-t border-gray-100 pt-4">
                    {notes.map(n => (
                        <div key={n.id} className="text-sm flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-xs text-gray-400 mb-0.5">{new Date(n.created_at).toLocaleString('pt-BR')}</p>
                                <p className="text-gray-700 whitespace-pre-line">{n.note}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => deleteNote(n)}
                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg flex-shrink-0"
                                title="Remover atualização"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
