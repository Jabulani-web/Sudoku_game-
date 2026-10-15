
const boardElement = document.getElementById("board");
const difficultyElement = document.getElementById("difficulty");
const timerElement = document.getElementById("timer");
const mistakesElement = document.getElementById("mistakes");
const hintsElement = document.getElementById("hints-left");
const messageElement = document.getElementById("message");
const notesButton = document.getElementById("notes-button");
const modal = document.getElementById("modal");

const SIZE = 9;
const MAX_MISTAKES = 3;
const MAX_HINTS = 3;

const difficultySettings = {
  easy: 36,
  medium: 46,
  hard: 52
};

let solution = [];
let puzzle = [];
let initialPuzzle = [];
let selectedIndex = null;
let mistakes = 0;
let hintsLeft = MAX_HINTS;
let elapsedSeconds = 0;
let timerInterval = null;
let notesMode = false;
let gameOver = false;
let gameWon = false;
let notes = [];
let wrongCells = new Set();
let hintedCells = new Set();

function shuffle(array) {
  const result = [...array];

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function pattern(row, column) {
  return (row * 3 + Math.floor(row / 3) + column) % SIZE;
}

function shuffledIndices() {
  const bands = shuffle([0, 1, 2]);
  const rows = bands.flatMap(band =>
    shuffle([0, 1, 2]).map(row => band * 3 + row)
  );

  const stacks = shuffle([0, 1, 2]);
  const columns = stacks.flatMap(stack =>
    shuffle([0, 1, 2]).map(column => stack * 3 + column)
  );

  return { rows, columns };
}

function generateSolution() {
  const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const { rows, columns } = shuffledIndices();
  const transpose = Math.random() < 0.5;

  return rows.map(row =>
    columns.map(column => {
      const r = transpose ? column : row;
      const c = transpose ? row : column;
      return digits[pattern(r, c)];
    })
  );
}

function makePuzzle(fullSolution, blanks) {
  const result = fullSolution.map(row => [...row]);
  const positions = shuffle(
    Array.from({ length: SIZE * SIZE }, (_, index) => index)
  );

  for (const position of positions.slice(0, blanks)) {
    result[Math.floor(position / SIZE)][position % SIZE] = 0;
  }

  return result;
}

function getValue(index) {
  return puzzle[Math.floor(index / SIZE)][index % SIZE];
}

function setValue(index, value) {
  puzzle[Math.floor(index / SIZE)][index % SIZE] = value;
}

function getSolutionValue(index) {
  return solution[Math.floor(index / SIZE)][index % SIZE];
}

function getRow(index) {
  return Math.floor(index / SIZE);
}

function getColumn(index) {
  return index % SIZE;
}

function sameBox(a, b) {
  return (
    Math.floor(getRow(a) / 3) === Math.floor(getRow(b) / 3) &&
    Math.floor(getColumn(a) / 3) === Math.floor(getColumn(b) / 3)
  );
}

function areRelated(a, b) {
  return (
    getRow(a) === getRow(b) ||
    getColumn(a) === getColumn(b) ||
    sameBox(a, b)
  );
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function showMessage(text, type = "") {
  messageElement.textContent = text;
  messageElement.className = `message ${type}`.trim();
}

function startTimer() {
  clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    if (gameOver) return;

    elapsedSeconds++;
    timerElement.textContent = formatTime(elapsedSeconds);
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

function loadBestTimes() {
  let bestTimes = {};

  try {
    bestTimes = JSON.parse(
      localStorage.getItem("sudoku-best-times") || "{}"
    ) || {};
  } catch {
    bestTimes = {};
  }

  for (const level of ["easy", "medium", "hard"]) {
    const value = bestTimes[level];
    document.getElementById(`best-${level}`).textContent =
      Number.isFinite(value) && value >= 0
        ? formatTime(value)
        : "--:--";
  }
}

function saveBestTime() {
  let bestTimes = {};

  try {
    bestTimes = JSON.parse(
      localStorage.getItem("sudoku-best-times") || "{}"
    ) || {};
  } catch {
    bestTimes = {};
  }

  const level = difficultyElement.value;
  const previous = bestTimes[level];

  if (typeof previous !== "number" || elapsedSeconds < previous) {
    bestTimes[level] = elapsedSeconds;

    try {
      localStorage.setItem(
        "sudoku-best-times",
        JSON.stringify(bestTimes)
      );
    } catch {
      showMessage("Puzzle solved! Browser storage is unavailable.");
    }
  }

  loadBestTimes();
}

function renderBoard() {
  boardElement.innerHTML = "";

  const selectedValue =
    selectedIndex !== null ? getValue(selectedIndex) : 0;

  const duplicateCells = new Set();

  for (let index = 0; index < 81; index++) {
    const value = getValue(index);

    if (!value) continue;

    for (let other = index + 1; other < 81; other++) {
      if (
        getValue(other) === value &&
        areRelated(index, other)
      ) {
        duplicateCells.add(index);
        duplicateCells.add(other);
      }
    }
  }

  for (let index = 0; index < 81; index++) {
    const row = getRow(index);
    const column = getColumn(index);
    const value = getValue(index);
    const cell = document.createElement("button");

    cell.type = "button";
    cell.className = "cell";
    cell.setAttribute("role", "gridcell");
    cell.setAttribute("aria-label", `Row ${row + 1}, column ${column + 1}${value ? `, ${value}` : ", empty"}`);

    if (initialPuzzle[row][column] !== 0) {
      cell.classList.add("given");
    }

    if (column === 2 || column === 5) {
      cell.classList.add("box-right");
    }

    if (row === 2 || row === 5) {
      cell.classList.add("box-bottom");
    }

    if (
      selectedIndex !== null &&
      areRelated(index, selectedIndex)
    ) {
      cell.classList.add("related");
    }

    if (
      selectedIndex !== null &&
      value !== 0 &&
      value === selectedValue
    ) {
      cell.classList.add("same-number");
    }

    if (index === selectedIndex) {
      cell.classList.add("selected");
      cell.setAttribute("aria-selected", "true");
    }

    if (duplicateCells.has(index)) {
      cell.classList.add("conflict");
    }

    if (wrongCells.has(index)) {
      cell.classList.add("wrong");
    }

    if (hintedCells.has(index)) {
      cell.classList.add("hinted");
    }

    if (value !== 0) {
      cell.textContent = value;
    } else if (notes[index].size > 0) {
      cell.classList.add("notes-cell");

      const notesGrid = document.createElement("span");
      notesGrid.className = "notes-grid";

      for (let number = 1; number <= 9; number++) {
        const note = document.createElement("span");
        note.textContent = notes[index].has(number) ? number : "";
        notesGrid.appendChild(note);
      }

      cell.appendChild(notesGrid);
    }

    cell.disabled = gameOver;
    cell.addEventListener("click", () => selectCell(index));
    boardElement.appendChild(cell);
  }

  updateNumberPad();
}

function updateNumberPad() {
  document.querySelectorAll(".number-button").forEach(button => {
    const number = Number(button.dataset.number);

    const count = puzzle.flat().filter(value => value === number).length;

    button.disabled = gameOver || count === 9;
    button.setAttribute(
      "aria-label",
      `Enter ${number}, ${9 - count} remaining`
    );
  });
}

function selectCell(index) {
  if (gameOver) return;

  selectedIndex = index;
  renderBoard();
}

function updateStats() {
  timerElement.textContent = formatTime(elapsedSeconds);
  mistakesElement.innerHTML =
    `${mistakes} <span class="stat-muted">/ ${MAX_MISTAKES}</span>`;
  hintsElement.textContent = hintsLeft;
}

function enterNumber(number) {
  if (gameOver || selectedIndex === null) {
    showMessage("Select an empty square first.");
    return;
  }

  if (initialPuzzle.flat()[selectedIndex] !== 0) {
    showMessage("That number is part of the original puzzle.");
    return;
  }

  if (notesMode) {
    if (getValue(selectedIndex) !== 0) {
      showMessage("Erase this square before adding notes.");
      return;
    }

    if (notes[selectedIndex].has(number)) {
      notes[selectedIndex].delete(number);
    } else {
      notes[selectedIndex].add(number);
    }

    renderBoard();
    showMessage("Notes updated.");
    return;
  }

  const index = selectedIndex;

  if (getValue(index) === number) {
    showMessage("That number is already in this square.");
    return;
  }

  wrongCells.delete(index);
  hintedCells.delete(index);
  notes[index].clear();

  if (number !== getSolutionValue(index)) {
    mistakes++;
    updateStats();

    if (mistakes >= MAX_MISTAKES) {
      renderBoard();
      finishGame(false, "Too many mistakes!");
      return;
    }

    showMessage(
      `Not quite! You have ${MAX_MISTAKES - mistakes} mistake(s) remaining.`,
      "error"
    );
  } else {
    showMessage("Correct number. Keep going!", "success");
  }

  setValue(index, number);
  renderBoard();
  updateStats();

  if (puzzle.flat().every((value, i) => value === solution.flat()[i])) {
    finishGame(true);
  }
}

function eraseSelected() {
  if (gameOver || selectedIndex === null) return;

  if (initialPuzzle.flat()[selectedIndex] !== 0) {
    showMessage("You cannot erase a fixed number.");
    return;
  }

  setValue(selectedIndex, 0);
  notes[selectedIndex].clear();
  wrongCells.delete(selectedIndex);
  hintedCells.delete(selectedIndex);

  renderBoard();
  showMessage("Square cleared.");
}

function useHint() {
  if (gameOver) return;

  if (hintsLeft <= 0) {
    showMessage("You have used all your hints.");
    return;
  }

  let index = selectedIndex;

  if (
    index === null ||
    initialPuzzle.flat()[index] !== 0 ||
    getValue(index) === getSolutionValue(index)
  ) {
    index = puzzle.flat().findIndex(
      (value, i) =>
        value !== solution.flat()[i] &&
        initialPuzzle.flat()[i] === 0
    );
  }

  if (index < 0) {
    showMessage("There are no empty squares left to hint.");
    return;
  }

  selectedIndex = index;
  setValue(index, getSolutionValue(index));
  notes[index].clear();
  wrongCells.delete(index);
  hintedCells.add(index);
  hintsLeft--;

  renderBoard();
  updateStats();
  showMessage("Hint used! A correct number has been revealed.", "success");

  if (puzzle.flat().every((value, i) => value === solution.flat()[i])) {
    finishGame(true);
  }
}

function checkPuzzle() {
  if (gameOver) return;

  let emptyCount = 0;
  let incorrectCount = 0;
  wrongCells.clear();

  for (let index = 0; index < 81; index++) {
    const value = getValue(index);

    if (value === 0) {
      emptyCount++;
    } else if (value !== getSolutionValue(index)) {
      incorrectCount++;
      wrongCells.add(index);
    }
  }

  if (emptyCount === 0 && incorrectCount === 0) {
    finishGame(true);
  } else if (incorrectCount > 0) {
    showMessage(
      `There ${incorrectCount === 1 ? "is" : "are"} ${incorrectCount} incorrect number(s). Check the red squares.`,
      "error"
    );
    renderBoard();
  } else {
    showMessage(
      `${emptyCount} square(s) remain. Everything filled so far is correct.`,
      "success"
    );
    renderBoard();
  }
}


function resetBoard() {
  if (gameOver) {
    showMessage("Start a new game to continue playing.");
    return;
  }

  puzzle = initialPuzzle.map(row => [...row]);
  selectedIndex = null;
  mistakes = 0;
  hintsLeft = MAX_HINTS;
  elapsedSeconds = 0;
  wrongCells = new Set();
  hintedCells = new Set();
  notes = Array.from({ length: 81 }, () => new Set());

  updateStats();
  renderBoard();
  startTimer();
  showMessage("Board reset. Your original puzzle has been restored.");
}


function finishGame(won, message = "") {
  gameOver = true;
  gameWon = won;
  stopTimer();

  if (won) {
    saveBestTime();
    showMessage(
      "Congratulations! You solved the Sudoku puzzle.",
      "success"
    );
  } else {
    showMessage(
      message || "Game over. Start a new game to try again.",
      "error"
    );
  }

  renderBoard();
  updateStats();

  const modalTitle = document.getElementById("modal-title");
  const modalMessage = document.getElementById("modal-message");

  if (modalTitle) {
    modalTitle.textContent = won ? "Puzzle Solved!" : "Game Over";
  }

  if (modalMessage) {
    modalMessage.textContent = won
      ? `You completed the puzzle in ${formatTime(elapsedSeconds)}.`
      : (message || "You reached the maximum number of mistakes.");
  }

  modal.hidden = false;

  const modalNewGame = document.getElementById("modal-new-game");

  if (modalNewGame) {
    modalNewGame.textContent = won ? "Play Again" : "Try Again";
    modalNewGame.focus();
  }
}

function newGame() {
  stopTimer();

  const difficulty = difficultyElement.value;
  const blanks =
    difficultySettings[difficulty] ?? difficultySettings.easy;

  solution = generateSolution();
  puzzle = makePuzzle(solution, blanks);
  initialPuzzle = puzzle.map(row => [...row]);

  selectedIndex = null;
  mistakes = 0;
  hintsLeft = MAX_HINTS;
  elapsedSeconds = 0;
  notesMode = false;
  gameOver = false;
  gameWon = false;

  notes = Array.from({ length: 81 }, () => new Set());
  wrongCells = new Set();
  hintedCells = new Set();

  notesButton.textContent = "✎ Notes: Off";
  notesButton.setAttribute("aria-pressed", "false");

  modal.hidden = true;

  updateStats();
  renderBoard();
  startTimer();

  showMessage("New puzzle ready. Select an empty square to begin.");
}


document.querySelectorAll(".number-button").forEach(button => {
  button.addEventListener("click", () => {
    enterNumber(Number(button.dataset.number));
  });
});

document.getElementById("new-game").addEventListener("click", newGame);
document.getElementById("erase-button").addEventListener("click", eraseSelected);
document.getElementById("hint-button").addEventListener("click", useHint);
document.getElementById("check-button").addEventListener("click", checkPuzzle);
document.getElementById("reset-button").addEventListener("click", resetBoard);

notesButton.addEventListener("click", () => {
  if (gameOver) return;

  notesMode = !notesMode;
  notesButton.textContent = notesMode ? "✎ Notes: On" : "✎ Notes: Off";
  notesButton.setAttribute("aria-pressed", String(notesMode));

  showMessage(
    notesMode
      ? "Notes mode is on. Choose numbers to add or remove pencil marks."
      : "Notes mode is off."
  );
});

difficultyElement.addEventListener("change", newGame);

document.getElementById("modal-new-game").addEventListener("click", newGame);

document.getElementById("modal-close").addEventListener("click", () => {
  modal.hidden = true;
  if (!gameOver) {
    document.getElementById("new-game").focus();
  }
});

modal.addEventListener("click", event => {
  if (event.target === modal) {
    modal.hidden = true;
  }
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !modal.hidden) {
    modal.hidden = true;
    return;
  }

  if (gameOver || !modal.hidden) return;

  if (/^[1-9]$/.test(event.key)) {
    enterNumber(Number(event.key));
    return;
  }

  if (
    ["Backspace", "Delete", "0"].includes(event.key)
  ) {
    eraseSelected();
    return;
  }

  if (selectedIndex === null) return;

  let nextIndex = selectedIndex;

  switch (event.key) {
    case "ArrowUp":
      nextIndex = Math.max(0, selectedIndex - SIZE);
      break;
    case "ArrowDown":
      nextIndex = Math.min(80, selectedIndex + SIZE);
      break;
    case "ArrowLeft":
      if (selectedIndex % SIZE > 0) nextIndex--;
      break;
    case "ArrowRight":
      if (selectedIndex % SIZE < 8) nextIndex++;
      break;
    default:
      return;
  }

  event.preventDefault();
  selectCell(nextIndex);
});

loadBestTimes();
newGame();
