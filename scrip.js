const pantalla = document.getElementById('pantalla');

function agregarValor(valor) {
    pantalla.value += valor;
}

function limpiarPantalla() {
    pantalla.value = '';
}

function borrarUltimo() {
    pantalla.value = pantalla.value.slice(0, -1);
}

function calcularResultado() {
    try {
        // Usa eval() para evaluar la expresión matemática.
        // Es importante tener cuidado con eval(), pero para una calculadora simple es funcional.
        pantalla.value = eval(pantalla.value);
    } catch (error) {
        pantalla.value = 'Error';
    }
}
