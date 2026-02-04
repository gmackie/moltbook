import { useState, useEffect } from 'react';
import { Slider } from './Slider';
import { api } from '../api/client';
import type { PersonaConfig } from '../api/types';

const defaultPersona: PersonaConfig = {
  voice: { formality: 50, humor: 50, verbosity: 50, confidence: 50 },
  content: { topicsOfInterest: [], topicsToAvoid: [], opinionStrength: 50 },
  social: { warmth: 50, agreeableness: 50, initiative: 50 },
};

export function PersonaEditor() {
  const [persona, setPersona] = useState<PersonaConfig>(defaultPersona);
  const [activeTab, setActiveTab] = useState<'voice' | 'content' | 'social'>('voice');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getPersona().then(res => {
      if (res.success && res.data?.persona) {
        setPersona(res.data.persona);
      }
    });
  }, []);

  const updateVoice = (key: keyof PersonaConfig['voice'], value: number) => {
    setPersona(p => ({ ...p, voice: { ...p.voice, [key]: value } }));
    setDirty(true);
  };

  const updateSocial = (key: keyof PersonaConfig['social'], value: number) => {
    setPersona(p => ({ ...p, social: { ...p.social, [key]: value } }));
    setDirty(true);
  };

  const updateContent = (key: keyof PersonaConfig['content'], value: number | string[]) => {
    setPersona(p => ({ ...p, content: { ...p.content, [key]: value } }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    const result = await api.updatePersona(persona);

    if (result.success && result.data) {
      setPersona(result.data.persona);
      setDirty(false);
    } else {
      setError(result.error || 'Failed to save');
    }

    setSaving(false);
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-4">Persona</h2>

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {(['voice', 'content', 'social'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 rounded text-sm capitalize ${
              activeTab === tab ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Voice Tab */}
      {activeTab === 'voice' && (
        <div className="space-y-4">
          <Slider
            label="Formality"
            value={persona.voice.formality}
            onChange={(v) => updateVoice('formality', v)}
            leftLabel="Casual"
            rightLabel="Professional"
          />
          <Slider
            label="Humor"
            value={persona.voice.humor}
            onChange={(v) => updateVoice('humor', v)}
            leftLabel="Serious"
            rightLabel="Playful"
          />
          <Slider
            label="Verbosity"
            value={persona.voice.verbosity}
            onChange={(v) => updateVoice('verbosity', v)}
            leftLabel="Terse"
            rightLabel="Elaborate"
          />
          <Slider
            label="Confidence"
            value={persona.voice.confidence}
            onChange={(v) => updateVoice('confidence', v)}
            leftLabel="Tentative"
            rightLabel="Assertive"
          />
        </div>
      )}

      {/* Social Tab */}
      {activeTab === 'social' && (
        <div className="space-y-4">
          <Slider
            label="Warmth"
            value={persona.social.warmth}
            onChange={(v) => updateSocial('warmth', v)}
            leftLabel="Distant"
            rightLabel="Friendly"
          />
          <Slider
            label="Agreeableness"
            value={persona.social.agreeableness}
            onChange={(v) => updateSocial('agreeableness', v)}
            leftLabel="Contrarian"
            rightLabel="Agreeable"
          />
          <Slider
            label="Initiative"
            value={persona.social.initiative}
            onChange={(v) => updateSocial('initiative', v)}
            leftLabel="Reactive"
            rightLabel="Proactive"
          />
        </div>
      )}

      {/* Content Tab */}
      {activeTab === 'content' && (
        <div className="space-y-4">
          <Slider
            label="Opinion Strength"
            value={persona.content.opinionStrength}
            onChange={(v) => updateContent('opinionStrength', v)}
            leftLabel="Neutral"
            rightLabel="Strong Takes"
          />
          <div>
            <label className="block text-sm mb-1">Topics of Interest</label>
            <input
              type="text"
              placeholder="AI, philosophy, tech..."
              className="w-full bg-gray-700 rounded px-3 py-2 text-sm"
              value={persona.content.topicsOfInterest.join(', ')}
              onChange={(e) => updateContent('topicsOfInterest', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Topics to Avoid</label>
            <input
              type="text"
              placeholder="politics, religion..."
              className="w-full bg-gray-700 rounded px-3 py-2 text-sm"
              value={persona.content.topicsToAvoid.join(', ')}
              onChange={(e) => updateContent('topicsToAvoid', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
            />
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mt-4 text-red-400 text-sm">{error}</div>
      )}

      {/* Save button */}
      <div className="mt-6">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className={`w-full rounded py-2 text-sm font-medium ${
            dirty && !saving
              ? 'bg-blue-600 hover:bg-blue-500'
              : 'bg-gray-600 cursor-not-allowed'
          }`}
        >
          {saving ? 'Saving...' : dirty ? 'Save Changes' : 'Saved'}
        </button>
      </div>
    </div>
  );
}
