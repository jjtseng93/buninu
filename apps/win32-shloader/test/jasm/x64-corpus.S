.intel_syntax noprefix
start:
    add rax, 1000
    add eax, 5
    add al, 5
    add bl, 200
    add cx, 300
    sub rbx, -129
    and r9d, 0xff00
    or qword ptr [rsp + 8], 1
    xor byte ptr [rbp], 0x7f
    cmp dword ptr [r12 + r13*4 + 0x100], -1
    cmp rax, [rbx]
    adc rdx, r8
    sbb esi, edi
    mov al, 0x12
    mov sil, dil
    mov r10b, 3
    mov ax, 0x1234
    mov rax, 0x123456789
    mov rax, -5
    mov eax, 0xffffffff
    mov byte ptr [rdi], 1
    mov word ptr [rdi + 2], -2
    mov qword ptr [rbp - 8], rsi
    mov rdx, [r13]
    mov ecx, [rip + 16]
    mov rax, [rip + ext_data + 4]
    test al, 1
    test rdi, 0x100
    test dword ptr [rsi], 4
    test r8, r9
    lea rax, [rbx + rcx*8 - 16]
    lea r8, [rip + start]
    lea eax, [rdi + 1]
    movzx eax, byte ptr [rsi]
    movzx r9, word ptr [rax]
    movsx rcx, al
    movsxd rax, edx
    inc dword ptr [rax]
    dec rcx
    neg r11
    not esi
    mul rbx
    idiv ecx
    imul rax, rbx
    imul eax, ecx, 100
    imul edx, esi, 5
    shl eax, 1
    shr rdx, 4
    sar r10d, cl
    rol byte ptr [rdi], 3
    push rbp
    push r12
    pop r15
    push 10
    push 1000
    push qword ptr [rax]
    sete al
    setne r9b
    cmovl rax, rcx
    cmovge edx, [rbx]
    xchg rax, rcx
    xchg ecx, edx
    call ext_func
    call rax
    call qword ptr [rip + ext_ptr]
    jmp qword ptr [rax + 8]
    jmp near_label
    jne far_label
    jmp ext_func
    je ext_func
near_label:
    ret
    ret 8
    int 3
    int3
    ud2
    cqo
    syscall
    .p2align 4
far_label:

    .zero 130
    jmp start
    jb start
    .byte 1, 2, -1
    .short 0x1234
    .long 0x12345678
    .quad -1
    .ascii "ab\n"
    .asciz "z"
    .balign 8
    nop
b124:
  jmp f124
  jne f124
  .zero 124
f124:
  jmp b124
  je b124
b125:
  jmp f125
  jne f125
  .zero 125
f125:
  jmp b125
  je b125
b126:
  jmp f126
  jne f126
  .zero 126
f126:
  jmp b126
  je b126
b127:
  jmp f127
  jne f127
  .zero 127
f127:
  jmp b127
  je b127
b128:
  jmp f128
  jne f128
  .zero 128
f128:
  jmp b128
  je b128
b129:
  jmp f129
  jne f129
  .zero 129
f129:
  jmp b129
  je b129
chain: jmp c1
  jne c1
  .zero 3
  jne c2
  .zero 3
  jne c3
  .zero 3
  jne c4
  .zero 3
  jne c5
  .zero 3
  jne c6
  .zero 3
  jne c7
  .zero 3
  jne c8
  .zero 3
  jne c9
  .zero 3
  jne c10
  .zero 3
  jne c11
  .zero 3
  jne c12
  .zero 3
  jne c13
  .zero 3
  jne c14
  .zero 3
  jne c15
  .zero 3
  jne c16
  .zero 3
  jne c17
  .zero 3
  jne c18
  .zero 3
  jne c19
  .zero 3
  jne c20
  .zero 3
  jne c21
  .zero 3
  jne c22
  .zero 3
  jne c23
  .zero 3
  jne c24
  .zero 3
  jne c25
  .zero 3
  jne c26
  .zero 3
  jne c27
  .zero 3
  jne c28
  .zero 3
  jne c29
  .zero 3
  jne c30
  .zero 3
  jne c31
  .zero 3
  jne c32
  .zero 3
  jne c33
  .zero 3
  jne c34
  .zero 3
  jne c35
  .zero 3
  jne c36
  .zero 3
  jne c37
  .zero 3
  jne c38
  .zero 3
  jne c39
  .zero 3
  jne c40
  .zero 3
c1: nop
c2: nop
c3: nop
c4: nop
c5: nop
c6: nop
c7: nop
c8: nop
c9: nop
c10: nop
c11: nop
c12: nop
c13: nop
c14: nop
c15: nop
c16: nop
c17: nop
c18: nop
c19: nop
c20: nop
c21: nop
c22: nop
c23: nop
c24: nop
c25: nop
c26: nop
c27: nop
c28: nop
c29: nop
c30: nop
c31: nop
c32: nop
c33: nop
c34: nop
c35: nop
c36: nop
c37: nop
c38: nop
c39: nop
c40: nop
