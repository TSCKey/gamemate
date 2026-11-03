import type { RecipeView } from '../../../preload/index.d'
import { Picture } from './Pictures'
import { t } from '../i18n'

const GRID_SIZE = 3

// Pads a recipe's grid to the 3x3 crafting table so every card has the same shape.
function padGrid(grid: (string | null)[][]): (string | null)[][] {
  return Array.from({ length: GRID_SIZE }, (_, y) =>
    Array.from({ length: GRID_SIZE }, (_, x) => grid[y]?.[x] ?? null)
  )
}

function RecipeCard({ recipe }: { recipe: RecipeView }): React.JSX.Element {
  return (
    <div className="recipe">
      <div
        className="recipe-grid"
        aria-label={t('recipeCard.craftingGridFor', { item: recipe.item })}
      >
        {padGrid(recipe.grid)
          .flat()
          .map((cell, i) => (
            <div
              key={i}
              className={cell ? 'recipe-slot' : 'recipe-slot is-empty'}
              title={cell ?? ''}
            >
              {/* The game's icon when GameMate could get it from the wiki, otherwise the name. */}
              {cell && recipe.icons?.[cell] ? (
                <img className="recipe-icon" src={recipe.icons[cell]} alt={cell} />
              ) : (
                cell
              )}
            </div>
          ))}
      </div>
      {recipe.picture && (
        <>
          <div className="recipe-arrow" aria-hidden="true">
            →
          </div>
          <Picture picture={recipe.picture} className="recipe-picture" />
        </>
      )}
      <div className="recipe-info">
        <div className="recipe-title">
          {recipe.item}
          {recipe.count > 1 && <span className="recipe-count"> ×{recipe.count}</span>}
        </div>
        <ul>
          {recipe.totals.map((t) => (
            <li key={t.label}>
              {t.count} × {t.label}
            </li>
          ))}
        </ul>
        {recipe.shapeless && (
          <div className="recipe-note">{t('recipeCard.anyArrangementWorks')}</div>
        )}
      </div>
    </div>
  )
}

export default RecipeCard
