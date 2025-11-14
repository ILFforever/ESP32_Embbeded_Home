#ifndef TOUCH_H
#define TOUCH_H

#include <stdint.h>
#include <SPI.h>
#include <Wire.h>
#include <Arduino.h>

#define GSL1680_WAKE 15
#define GSL1680_INT 17

struct _ts_event
{
    uint16_t x1;
    uint16_t y1;
    uint16_t x2;
    uint16_t y2;
    uint16_t x3;
    uint16_t y3;
    uint16_t x4;
    uint16_t y4;
    uint16_t x5;
    uint16_t y5;
    uint8_t fingers;
};

struct fw_data
{
    uint8_t offset;
    uint32_t val;
};

extern uint8_t addr;
extern uint16_t tx, ty;
extern struct _ts_event ts_event;

static void GSLX680_I2C_Write(uint8_t regAddr, uint8_t *val, uint16_t cnt);
uint8_t GSLX680_I2C_Read(uint8_t reg, uint8_t *buf, uint8_t len);
uint8_t GSLX680_read_data(void);
void inttostr(uint16_t value, uint8_t *str);
static void _GSLX680_clr_reg(void);
static void _GSLX680_reset_chip(void);
static void _GSLX680_load_fw(void);
static void _GSLX680_startup_chip(void);
static void check_mem_data(void);
void touchsetup();

#endif // TOUCH_H
