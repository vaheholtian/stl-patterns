import type { VoronoiMethod } from '../../state/voronoiMethod'

interface Props {
  value: VoronoiMethod
  modelLoaded: boolean
  onChange: (m: VoronoiMethod) => void
}

/**
 * The one switch a Voronoi tile has that other patterns do not: lay it out as
 * a repeating tile like everything else, or scatter cells over the selected
 * surface itself. Sits at the top of the placement section; the section below
 * it shows only the chosen method's controls.
 */
export default function MethodPicker({ value, modelLoaded, onChange }: Props) {
  return (
    <div className="method-picker">
      <div className="row wrap" role="radiogroup" aria-label="Voronoi method">
        <label className="muted">Method</label>
        <button
          type="button"
          role="radio"
          aria-checked={value === 'tile'}
          className={'small' + (value === 'tile' ? ' active' : '')}
          title="Lay the seamless tile over the flattened surface, with preview, placement and size"
          onClick={() => onChange('tile')}
        >Repeating tile</button>
        <button
          type="button"
          role="radio"
          aria-checked={value === 'surface'}
          className={'small' + (value === 'surface' ? ' active' : '')}
          disabled={!modelLoaded}
          title={modelLoaded
            ? 'Scatter and relax cells over the selected surface itself: no flattening, no tile placement'
            : 'Load a model to generate cells on its surface'}
          onClick={() => onChange('surface')}
        >Generate on surface</button>
      </div>
      {!modelLoaded && <div className="muted method-note">Generate on surface becomes available once a model is loaded.</div>}
    </div>
  )
}
