// © Guillaume Estace

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('start-game').addEventListener('click', startGame);
    document.getElementById('back-to-menu').addEventListener('click', backToMenu);
    document.getElementById('restart-test').addEventListener('click', restartTest);
    document.getElementById('next-question').addEventListener('click', skipQuestion);

    const notes = {};
    const noteMap = {
        'C': 0, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11
    };
    const reverseNoteMap = Object.keys(noteMap).reduce((acc, key) => {
        acc[noteMap[key]] = key;
        return acc;
    }, {});
    const enharmonicMap = {
        'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#'
    };
    const triadStructures = [
        { type: 'Maj', intervals: [4, 3], inversion: 'PF' },
        { type: 'Min', intervals: [3, 4], inversion: 'PF' },
        { type: 'Aug', intervals: [4, 4], inversion: 'PF' },
        { type: 'Sus4', intervals: [5, 2], inversion: 'PF' },
        { type: 'Dim', intervals: [3, 3], inversion: 'PF' },
        { type: 'Maj', intervals: [3, 5], inversion: 'R1' },
        { type: 'Min', intervals: [4, 5], inversion: 'R1' },
        { type: 'Sus4', intervals: [2, 5], inversion: 'R1' },
        { type: 'Dim', intervals: [3, 6], inversion: 'R1' },
        { type: 'Maj', intervals: [5, 4], inversion: 'R2' },
        { type: 'Min', intervals: [5, 3], inversion: 'R2' },
        { type: 'Sus4', intervals: [5, 5], inversion: 'R2' },
        { type: 'Dim', intervals: [6, 3], inversion: 'R2' },


    ];
    const triads = [
        { name: 'Major', label: 'Maj' },
        { name: 'Minor', label: 'Min' },
        { name: 'Augmented', label: 'Aug' },
        { name: 'Sus4', label: 'Sus4' },
        { name: 'Diminished', label: 'Dim' }

    ];
    const inversions = ['Root Position', 'First Inversion', 'Second Inversion'];

    for (let octave = 2; octave <= 5; octave++) {
        Object.keys(noteMap).forEach(note => {
            notes[`${note}${octave}`] = `audio/${note}${octave}.mp3`;
        });
    }

    let currentTriad;
    let currentNotes;
    let correctAnswer;
    let questionCount = 0;
    let correctAnswers = 0;
    const totalQuestions = 10; // Changer de 20 à 10
    let preloadedSounds = {};
    let startTime;
    let endTime;
    let firstNotePlayed;

    function startGame() {
        document.getElementById('menu').style.display = 'none';
        document.getElementById('game').style.display = 'block';
        document.getElementById('back-to-menu').style.display = 'block';
        document.getElementById('restart-test').style.display = 'block';
        document.getElementById('next-question').style.display = 'block';
        questionCount = 0;
        correctAnswers = 0;
        startTime = new Date();
        preloadSounds();
        nextQuestion();
    }

    function preloadSounds() {
        Object.keys(notes).forEach(note => {
            preloadedSounds[note] = new Audio(notes[note]);
            preloadedSounds[note].addEventListener('canplaythrough', () => {
                console.log(`Preloaded sound: ${note}`);
            }, false);
            
            preloadedSounds[note].addEventListener('error', () => {
                console.error(`Failed to preload sound: ${note}`);
            });
        });
    }

    function stopAllSounds() {
        Object.values(preloadedSounds).forEach(audio => {
            audio.pause();
            audio.currentTime = 0;
        });
    }

    function backToMenu() {
        document.getElementById('game').style.display = 'none';
        document.getElementById('menu').style.display = 'block';
        document.getElementById('back-to-menu').style.display = 'none';
        document.getElementById('restart-test').style.display = 'none';
        document.getElementById('next-question').style.display = 'none';
    }

    function restartTest() {
        document.getElementById('game').style.display = 'none';
        startGame();
    }

    function endGame() {
        endTime = new Date();
        const timeTaken = (endTime - startTime) / 1000;
        const resultDiv = document.getElementById('result');
        resultDiv.innerHTML = `
            <p>Test terminé !</p>
            <p>Nombre de bonnes réponses : ${correctAnswers} sur ${totalQuestions}</p>
            <p>Temps écoulé : ${timeTaken.toFixed(2)} secondes</p>
        `;
        document.getElementById('back-to-menu').style.display = 'block';
        document.getElementById('restart-test').style.display = 'block';
        document.getElementById('next-question').style.display = 'none';
    }

    function replay() {
        stopAllSounds();
        if (!currentNotes || currentNotes.length === 0) {
            console.error("No notes available to replay.");
            document.getElementById('question').innerText = "Aucune note à rejouer.";
            return;
        }
        document.getElementById('question').innerText = `Note jouée : ${getEnharmonicEquivalent(firstNotePlayed)}`;
        playSingleNoteThenTriad(currentNotes, firstNotePlayed);
    }

    function skipQuestion() {
        questionCount++;
        setTimeout(nextQuestion, 2000);
    }

    function nextQuestion() {
        document.getElementById('validation-message').textContent = ''; // Effacer le message de validation
        if (questionCount < totalQuestions) {
            document.getElementById('result').textContent = '';
            generateQuestion();
        } else {
            endGame();
        }
    }

    function generateQuestion() {
        const baseNote = getRandomNoteInRange(3, 2);
        const structure = getRandomTriadStructure();
        currentNotes = generateTriadFromStructure(baseNote, structure);

        // Utiliser `analyzeTriad` pour confirmer l'analyse et obtenir la bonne réponse
        const analysis = analyzeTriad(currentNotes);
        correctAnswer = `${analysis.fundamental}${analysis.triadType}${analysis.inversion}`;

        console.log(`Generated triad: ${currentNotes.join(', ')}`);
        console.log(`Correct Answer: ${correctAnswer}`);

        firstNotePlayed = currentNotes[Math.floor(Math.random() * 3)];
        document.getElementById('question').innerText = `Note jouée : ${getEnharmonicEquivalent(firstNotePlayed)}`;
        
        playSingleNoteThenTriad(currentNotes, firstNotePlayed);
        updateOptions();
    }

    function getRandomTriadStructure() {
        return triadStructures[Math.floor(Math.random() * triadStructures.length)];
    }

    function generateTriadFromStructure(baseNote, structure) {
        const noteIndex = noteMap[baseNote.slice(0, -1)];
        let octave = parseInt(baseNote.slice(-1));
        let notes = [baseNote];

        let currentIndex = noteIndex;

        structure.intervals.forEach(interval => {
            currentIndex = (currentIndex + interval) % 12;

            // Ajuster l'octave uniquement si nécessaire pour rester dans la plage
            if (currentIndex < noteIndex) {
                octave++;
                if (octave > 5) octave = 5; // Limite de l'octave supérieure
            }
            
            // Vérifier que la note existe dans noteMap
            const nextNoteName = reverseNoteMap[currentIndex];
            if (nextNoteName !== undefined) {
                const nextNote = `${nextNoteName}${octave}`;
                notes.push(nextNote);
            } else {
                console.error(`Invalid note index: ${currentIndex}`);
            }
        });

        // S'assurer que les notes sont triées de la plus grave à la plus aiguë
        notes.sort((a, b) => {
            const noteValueA = noteMap[a.slice(0, -1)] + parseInt(a.slice(-1)) * 12;
            const noteValueB = noteMap[b.slice(0, -1)] + parseInt(b.slice(-1)) * 12;
            return noteValueA - noteValueB;
        });

        // Limiter l'écart d'octave
        const minOctave = parseInt(notes[0].slice(-1));
        const maxOctave = minOctave + 1;
        notes = notes.map(note => {
            const noteName = note.slice(0, -1);
            let noteOctave = parseInt(note.slice(-1));
            if (noteOctave > maxOctave) noteOctave = maxOctave;
            return `${noteName}${noteOctave}`;
        });

        return notes;
    }

    function analyzeTriad(notes) {
        const [note1, note2, note3] = notes;
        const interval1 = (noteMap[note2.slice(0, -1)] - noteMap[note1.slice(0, -1)] + 12) % 12;
        const interval2 = (noteMap[note3.slice(0, -1)] - noteMap[note2.slice(0, -1)] + 12) % 12;

        let triadType = '';
        let inversion = '';
        let fundamental = note1.slice(0, -1);

        if (interval1 === 4 && interval2 === 3) {
            triadType = 'Maj';
            inversion = 'PF';
        } else if (interval1 === 3 && interval2 === 4) {
            triadType = 'Min';
            inversion = 'PF';
        } else if (interval1 === 4 && interval2 === 4) {
            triadType = 'Aug';
            inversion = 'PF';
        } else if (interval1 === 5 && interval2 === 2) {
            triadType = 'Sus4';
            inversion = 'PF';
        } else if (interval1 === 3 && interval2 === 3) {
            triadType = 'Dim';
            inversion = 'PF';
        } else if (interval1 === 3 && interval2 === 5) {
            triadType = 'Maj';
            inversion = 'R1';
            fundamental = note3.slice(0, -1);
        } else if (interval1 === 4 && interval2 === 5) {
            triadType = 'Min';
            inversion = 'R1';
            fundamental = note3.slice(0, -1);
        } else if (interval1 === 2 && interval2 === 5) {
            triadType = 'Sus4';
            inversion = 'R1';
            fundamental = note3.slice(0, -1);
        } else if (interval1 === 3 && interval2 === 6) {
            triadType = 'Dim';
            inversion = 'R1';
            fundamental = note3.slice(0, -1);
        } else if (interval1 === 5 && interval2 === 4) {
            triadType = 'Maj';
            inversion = 'R2';
            fundamental = note2.slice(0, -1);
        } else if (interval1 === 5 && interval2 === 3) {
            triadType = 'Min';
            inversion = 'R2';
            fundamental = note2.slice(0, -1);
        } else if (interval1 === 5 && interval2 === 5) {
            triadType = 'Sus4';
            inversion = 'R2';
            fundamental = note2.slice(0, -1);
        } else if (interval1 === 6 && interval2 === 3) {
            triadType = 'Dim';
            inversion = 'R2';
            fundamental = note2.slice(0, -1);
        }

        return { triadType, inversion, fundamental };
    }

    function getRandomNoteInRange(octaveRange, startOctave = 2) {
        const randomOctave = Math.floor(Math.random() * octaveRange) + startOctave;
        const randomNote = Object.keys(noteMap)[Math.floor(Math.random() * Object.keys(noteMap).length)];
        return `${randomNote}${randomOctave}`;
    }

    function getNoteName(noteIndex, octave) {
        return `${reverseNoteMap[noteIndex]}${octave}`;
    }

    function getEnharmonicEquivalent(note) {
        const noteName = note.slice(0, -1);
        const octave = note.slice(-1);
        const enharmonic = enharmonicMap[noteName];
        return enharmonic ? `${noteName}/${enharmonic}${octave}` : note;
    }

    function playSingleNoteThenTriad(notesArray, firstNote) {
        if (!preloadedSounds[firstNote]) {
            console.error(`Audio not preloaded for note: ${firstNote}`);
            document.getElementById('question').innerText = `Erreur: Le son de ${firstNote} n'a pas pu être chargé.`;
            return;
        }

        console.log(`Playing single note: ${firstNote}`);
        document.getElementById('question').innerText = `Note jouée : ${getEnharmonicEquivalent(firstNote)}`;
        preloadedSounds[firstNote].play().then(() => {
            setTimeout(() => {
                stopAllSounds();

                console.log(`Playing triad notes: ${notesArray.join(', ')}`);
                notesArray.forEach(note => {
                    if (preloadedSounds[note]) {
                        preloadedSounds[note].currentTime = 0;
                        preloadedSounds[note].play().catch(error => console.error('Error playing audio:', error));
                    } else {
                        console.error(`Audio not preloaded for note: ${note}`);
                    }
                });

                setTimeout(stopAllSounds, 8000);
            }, 4000);
        }).catch(error => console.error('Error playing audio:', error));
    }

    function updateOptions() {
        const optionsDiv = document.getElementById('options');
        optionsDiv.innerHTML = '';

        const triadSelect = document.createElement('select');
        triadSelect.id = 'triad-select';
        triads.forEach(triad => {
            const option = document.createElement('option');
            option.value = triad.label;
            option.textContent = triad.label;
            triadSelect.appendChild(option);
        });

        const inversionSelect = document.createElement('select');
        inversionSelect.id = 'inversion-select';
        inversions.forEach(inversion => {
            const option = document.createElement('option');
            option.value = inversion;
            option.textContent = inversion;
            inversionSelect.appendChild(option);
        });

        const fundamentalSelect = document.createElement('select');
        fundamentalSelect.id = 'fundamental-select';
        Object.keys(noteMap).forEach(note => {
            const option = document.createElement('option');
            const enharmonic = enharmonicMap[note];
            option.value = note;
            option.textContent = enharmonic ? `${note}/${enharmonic}` : note;
            fundamentalSelect.appendChild(option);
        });

        const submitButton = document.createElement('button');
        submitButton.textContent = 'Submit';
        submitButton.style.backgroundColor = 'green'; // Ajouter un style en ligne pour le bouton
        submitButton.style.color = 'white'; // Ajouter un style en ligne pour le texte du bouton
        submitButton.addEventListener('click', () => {
            const selectedTriad = triadSelect.value;
            const selectedInversion = inversionSelect.value;
            const selectedFundamental = fundamentalSelect.value;
            const selectedAnswer = `${selectedFundamental}${selectedTriad}${getInversionLabel(selectedInversion)}`;

            console.log(`Correct Answer: ${correctAnswer}`);
            console.log(`Selected Answer: ${selectedAnswer}`);

            const validationMessage = document.getElementById('validation-message');
            if (selectedAnswer === correctAnswer) {
                validationMessage.textContent = 'Correcte !';
                validationMessage.style.color = 'green';
                correctAnswers++;
            } else {
                validationMessage.textContent = `Incorrect, la bonne réponse était ${correctAnswer}.`;
                validationMessage.style.color = 'red';
            }
            questionCount++;
            setTimeout(nextQuestion, 2000);
        });

        const replayButton = document.createElement('button');
        replayButton.textContent = 'Replay';
        replayButton.style.backgroundColor = 'yellow'; // Ajouter un style en ligne pour le bouton
        replayButton.style.color = 'black'; // Ajouter un style en ligne pour le texte du bouton
        replayButton.addEventListener('click', replay);

        optionsDiv.appendChild(triadSelect);
        optionsDiv.appendChild(inversionSelect);
        optionsDiv.appendChild(fundamentalSelect);
        optionsDiv.appendChild(submitButton);
        optionsDiv.appendChild(replayButton); // Ajouter le bouton "Replay" sous le bouton "Submit"

        triadSelect.addEventListener('change', () => {
            inversionSelect.style.display = triadSelect.value === 'Aug' ? 'none' : 'block';
        });
        triadSelect.dispatchEvent(new Event('change'));
    }

    function getInversionLabel(inversion) {
        switch (inversion) {
            case 'Root Position':
                return 'PF';
            case 'First Inversion':
                return 'R1';
            case 'Second Inversion':
                return 'R2';
            default:
                return '';
        }
    }
});