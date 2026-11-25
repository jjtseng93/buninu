.text
.equ K, 12
start:
    add x0, x1, #4095
    add x0, x1, #4096
    add w0, w1, #-5
    sub sp, sp, #K*2
    add x0, sp, x1
    add sp, sp, x2, lsl #3
    add x3, x4, w5, sxtw #2
    adds x0, x1, x2, asr #3
    subs w9, w9, w10, lsr #31
    cmp x0, #0
    cmp w1, #-1
    cmp sp, #16
    cmn x5, x6
    neg x0, x1
    and x0, x1, #0xff
    and w0, w1, #0x80000000
    orr x2, x3, #0x5555555555555555
    eor x4, x5, #0xffff0000ffff0000
    ands w6, w7, #0x3c
    bic x0, x1, x2, lsl #4
    orn w0, w1, w2
    tst x0, #1
    tst w3, w4
    mvn x0, x1
    mov x0, sp
    mov sp, x9
    mov x0, x1
    mov w2, w3
    mov x0, #0x12340000
    mov x0, #0xffff0000ffffffff
    mov w0, #0xffff
    mov x0, #-0x10001
    mov x7, #0x00ff00ff00ff00ff
    movz x1, #5, lsl #32
    movk x1, #7, lsl #48
    movn w2, #3
    lsl x0, x1, #3
    lsr w0, w1, #4
    asr x0, x1, #63
    ror x0, x1, #8
    lsl x0, x1, x2
    asr w3, w4, w5
    uxtb w0, w1
    uxth w0, w1
    sxtb x0, w1
    sxth w0, w1
    sxtw x0, w1
    udiv x0, x1, x2
    sdiv w0, w1, w2
    mul x0, x1, x2
    madd w0, w1, w2, w3
    msub x0, x1, x2, x3
    mneg x0, x1, x2
    csel x0, x1, x2, eq
    csinc w0, w1, w2, ne
    csinv x0, x1, x2, lt
    csneg w0, w1, w2, ge
    cset x0, eq
    csetm w0, hi
    cinc x0, x1, mi
    cneg w0, w1, pl
    ldr x0, [x1]
    ldr w0, [x1, #4]
    ldr x0, [x1, #32760]
    ldr x0, [x1, #-8]
    ldr x0, [x1, #3]
    ldur x0, [x1, #8]
    ldr x0, [x1, #16]!
    ldr x0, [x1], #-16
    ldr x0, [x1, x2]
    ldr x0, [x1, x2, lsl #3]
    ldr w0, [x1, w2, uxtw #2]
    ldr w0, [x1, w2, sxtw]
    ldrb w0, [x1, x2]
    ldrb w0, [x1, x2, lsl #0]
    ldrsb x0, [x1]
    ldrsb w0, [x1, #1]
    ldrsh x0, [x1, #2]
    ldrsw x0, [x1, #4]
    strb w0, [x1, #4095]
    strh w0, [sp, #2]
    str xzr, [sp, #8]
    stur w0, [x1, #-1]
    ldr x0, [x16, :lo12:sym64]
    ldr w0, [x16, :lo12:sym32]
    ldrh w0, [x16, :lo12:sym16]
    ldrb w0, [x16, :lo12:sym8]
    add x0, x0, :lo12:sym+8
    adrp x0, sym+8
    ldr x5, start
    ldr w5, lit
    ldrsw x5, lit
    ldp x29, x30, [sp, #-16]!
    ldp x29, x30, [sp], #16
    stp w0, w1, [x2, #8]
    ldpsw x0, x1, [x2]
    stp x0, x1, [sp, #504]
    adr x0, start
    adr x1, lit
    b start
    bl ext_fn
    b ext_fn
    b.ne start
    beq lit
    b.hs ext_fn
    cbz x0, lit
    cbnz w3, start
    tbz x0, #40, lit
    tbnz w1, #3, start
    br x16
    blr x9
    ret
    ret x1
    brk #0x3e8
    svc #0
    nop
    .p2align 4
lit:
    .word 0x12345678
    .xword -2
    .hword 7
    .byte 9
    .balign 4
    nop
